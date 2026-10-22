"""Independent re-derivation of Ascent's published valuation validation results.

Python standard library only. It shares no code with the TypeScript implementation and reads nothing but
the published files: each report under evidence/, the per-sale samples file the report names, and the
bundled datasets (only to match their fingerprints). For every report it recomputes:

  - the report digest and the protocol digest (canonical JSON, byte-compatible with JavaScript),
  - the samples and dataset fingerprints,
  - every holdout figure: valued share, MdAPE, MAPE, PPE5/10/20, median ratio and signed error, COD, PRD,
    the common-set metrics, the paired comparisons with win rates, interval coverage and widths overall and
    by evidence tier, and the sale-price quartiles,
  - the seeded bootstrap intervals exactly (mulberry32, as the report's protocol declares),
  - each acceptance value, pass/fail verdict and the overall verdict.

What it cannot do is produce the per-sale estimates themselves: that needs the valuation engine
(`npm run validate:valuation -- --verify`) or an independent reimplementation of the method
(docs/replication/method-specification.md). The maintainers wrote this script; audit it, or write your own,
before relying on it.

  python3 -I scripts/replication/rederive.py                    every published report, exact bootstrap
  python3 -I scripts/replication/rederive.py --quick            skip the bootstrap intervals (seconds)
  python3 -I scripts/replication/rederive.py --json out.json evidence/valuation-validation-dc.json
  python3 -I scripts/replication/rederive.py --prng SEED N DRAWS  print bootstrap indices, for cross-checks

Exit status is 0 only when every check passes.
"""

import argparse
import bisect
import decimal
import gzip
import hashlib
import json
import math
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASELINES = ('baseline-median-ppsf', 'baseline-zip-median')


# ---- JavaScript-compatible canonical JSON (sorted keys, JSON.stringify number and string forms) ----

def js_number(value):
    """Number.prototype.toString for a finite double: shortest round-trip digits, ECMAScript layout."""
    if isinstance(value, bool):
        raise TypeError('booleans are not numbers here')
    if isinstance(value, int):
        return str(value)
    if not math.isfinite(value):
        raise ValueError('non-finite numbers cannot appear in a published report')
    if value == 0:
        return '0'
    if value < 0:
        return '-' + js_number(-value)
    sign, digits, exponent = decimal.Decimal(repr(value)).as_tuple()
    digits = list(digits)
    while len(digits) > 1 and digits[-1] == 0:
        digits.pop()
        exponent += 1
    s = ''.join(map(str, digits))
    k = len(s)
    n = exponent + k  # value = 0.s x 10^n
    if k <= n <= 21:
        return s + '0' * (n - k)
    if 0 < n <= 21:
        return s[:n] + '.' + s[n:]
    if -6 < n <= 0:
        return '0.' + '0' * (-n) + s
    e = n - 1
    mantissa = s if k == 1 else s[0] + '.' + s[1:]
    return f"{mantissa}e{'+' if e >= 0 else '-'}{abs(e)}"


def js_string(value):
    """JSON.stringify for a string: escapes quote, backslash and control characters only."""
    return json.dumps(value, ensure_ascii=False)


def canonical(value):
    if value is None:
        return 'null'
    if value is True:
        return 'true'
    if value is False:
        return 'false'
    if isinstance(value, (int, float)):
        return js_number(value)
    if isinstance(value, str):
        return js_string(value)
    if isinstance(value, list):
        return '[' + ','.join(canonical(item) for item in value) + ']'
    if isinstance(value, dict):
        keys = sorted(value, key=lambda key: key.encode('utf-16-be'))  # JavaScript compares UTF-16 code units
        return '{' + ','.join(f'{js_string(key)}:{canonical(value[key])}' for key in keys) + '}'
    raise TypeError(f'unexpected {type(value).__name__}')


def digest(value):
    return 'sha256-' + hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


# ---- Arithmetic exactly as the report defines it ----

def to_fixed(value, digits):
    """Number(value.toFixed(digits)): round the exact binary value half away from zero."""
    if not math.isfinite(value):
        return value
    quantum = decimal.Decimal(1).scaleb(-digits)
    return float(decimal.Decimal(value).quantize(quantum, rounding=decimal.ROUND_HALF_UP))


def js_round(value):
    """Math.round: halves round toward positive infinity."""
    return math.floor(value + 0.5)


def median(values):
    if not values:
        return math.nan
    ordered = sorted(values)
    middle = len(ordered) >> 1
    return ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2


def quantile(ordered, q):
    """Linear interpolation between order statistics of an already sorted list."""
    if not ordered:
        return math.nan
    position = (len(ordered) - 1) * q
    lower = math.floor(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def percentile_ci(values):
    ordered = sorted(values)
    return [to_fixed(quantile(ordered, 0.025), 6), to_fixed(quantile(ordered, 0.975), 6)]


def naive_sum(values):
    """Left-to-right floating-point sum, as JavaScript's reduce adds (Python 3.12's sum() compensates)."""
    total = 0.0
    for value in values:
        total += value
    return total


def ratio_metrics(pairs):
    """IAAO-style ratio study on estimate / sale-price ratios."""
    n = len(pairs)
    if not n:
        return {key: math.nan for key in ('mdape', 'mape', 'ppe5', 'ppe10', 'ppe20', 'medianRatio',
                                          'medianSignedError', 'cod', 'prd')} | {'n': 0}
    ratios = [estimate / actual for estimate, actual in pairs]
    ape = [abs(ratio - 1) for ratio in ratios]
    median_ratio = median(ratios)
    mean_ratio = naive_sum(ratios) / n
    weighted = sum(estimate for estimate, _ in pairs) / sum(actual for _, actual in pairs)

    def within(limit):
        return sum(1 for value in ape if value <= limit + 1e-12) / n

    return {
        'n': n,
        'mdape': to_fixed(median(ape), 6),
        'mape': to_fixed(naive_sum(ape) / n, 6),
        'ppe5': to_fixed(within(0.05), 6),
        'ppe10': to_fixed(within(0.1), 6),
        'ppe20': to_fixed(within(0.2), 6),
        'medianRatio': to_fixed(median_ratio, 6),
        'medianSignedError': to_fixed(median_ratio - 1, 6),
        'cod': to_fixed((100 * (naive_sum(abs(ratio - median_ratio) for ratio in ratios) / n)) / median_ratio, 4),
        'prd': to_fixed(mean_ratio / weighted, 6),
    }


MASK = 0xFFFFFFFF


def bootstrap_draws(n, resamples, seed):
    """Resampled index lists from mulberry32 seeded with `seed`: index = floor(u / 2^32 * n)."""
    state = seed & MASK
    for _ in range(resamples):
        draw = [0] * n
        for i in range(n):
            state = (state + 0x6D2B79F5) & MASK
            t = state
            t = ((t ^ (t >> 15)) * (t | 1)) & MASK
            t = (t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & MASK)) & MASK)) & MASK
            draw[i] = math.floor((((t ^ (t >> 14)) & MASK) / 4294967296) * n)
        yield draw


# ---- Samples ----

def read_samples(text):
    lines = text.strip('\n').split('\n')
    header = lines[0].split(',')
    variants = [name.split(':', 1)[1] for name in header if name.startswith('estimate:')]
    rows = []
    for line in lines[1:]:
        cells = dict(zip(header, line.split(',')))
        number = lambda key: None if cells[key] == '' else int(cells[key])  # noqa: E731 - every figure is integral
        rows.append({
            'actual': int(cells['actual']),
            'comps': int(cells['comps']),
            'estimates': {variant: number(f'estimate:{variant}') for variant in variants},
            'envelope': None if cells['envelope_low'] == '' else (int(cells['envelope_low']), int(cells['envelope_high'])),
            'interval': None if cells['interval_low'] == '' else (int(cells['interval_low']), int(cells['interval_high'])),
            'tier': cells['interval_tier'] or None,
        })
    return variants, rows


def rederive(report, rows, variants, bootstrap=True, progress=lambda message: None):
    protocol = report['protocol']
    primary = protocol['primaryVariant']
    resamples, seed = protocol['bootstrap']['resamples'], protocol['bootstrap']['seed']
    engine_variants = [variant['id'] for variant in report['variants'] if variant['assumptions'] is not None]

    def pairs_for(subset, variant):
        return [(row['estimates'][variant], row['actual']) for row in subset if row['estimates'][variant] is not None]

    per_variant = {}
    for offset, variant in enumerate(variants):
        pairs = pairs_for(rows, variant)
        entry = {'valuedShare': to_fixed(len(pairs) / len(rows), 6), 'metrics': ratio_metrics(pairs)}
        if bootstrap:
            progress(f'bootstrap {variant}')
            ape = [abs(estimate / actual - 1) for estimate, actual in pairs]
            limit = 0.1 + 1e-12
            mdapes, ppe10s = [], []
            for draw in bootstrap_draws(len(pairs), resamples, seed + offset):
                sample = sorted(ape[i] for i in draw)
                middle = len(sample) >> 1
                mdapes.append(sample[middle] if len(sample) % 2 else (sample[middle - 1] + sample[middle]) / 2)
                ppe10s.append(bisect.bisect_right(sample, limit) / len(sample))
            entry['mdapeCi95'] = percentile_ci(mdapes)
            entry['ppe10Ci95'] = percentile_ci(ppe10s)
        per_variant[variant] = entry

    common = [row for row in rows if all(row['estimates'][variant] is not None for variant in variants)]
    common_set = {'n': len(common), 'perVariant': {variant: ratio_metrics(pairs_for(common, variant)) for variant in variants}}

    paired = []
    for v, variant in enumerate(engine_variants):
        for b, baseline in enumerate(BASELINES):
            subset = [row for row in rows if row['estimates'][variant] is not None and row['estimates'][baseline] is not None]
            ape_v = [abs(row['estimates'][variant] / row['actual'] - 1) for row in subset]
            ape_b = [abs(row['estimates'][baseline] / row['actual'] - 1) for row in subset]
            entry = {
                'variant': variant,
                'baseline': baseline,
                'n': len(subset),
                'mdapeDelta': to_fixed(median(ape_v) - median(ape_b), 6),
                'winRate': to_fixed(sum(1 for x, y in zip(ape_v, ape_b) if x < y) / (len(subset) or 1), 6),
            }
            if bootstrap:
                progress(f'bootstrap {variant} vs {baseline}')
                deltas = [median([ape_v[i] for i in draw]) - median([ape_b[i] for i in draw])
                          for draw in bootstrap_draws(len(subset), resamples, seed + 100 + v * 10 + b)]
                entry['ci95'] = percentile_ci(deltas)
            paired.append(entry)

    primary_rows = [row for row in rows if row['estimates'][primary] is not None]

    def covered(row, bounds):
        return bounds is not None and bounds[0] <= row['actual'] <= bounds[1]

    def width(row, bounds):
        return (bounds[1] - bounds[0]) / row['estimates'][primary] if bounds is not None else math.nan

    def share(subset, test):
        return to_fixed(sum(1 for row in subset if test(row)) / (len(subset) or 1), 6)

    tiers = []
    for tier in protocol['interval']['tiers']:
        members = [row for row in primary_rows if row['interval'] is not None and row['tier'] == tier['id']]
        tiers.append({
            'tier': tier['id'],
            'n': len(members),
            'coverage': share(members, lambda row: covered(row, row['interval'])),
            'medianWidth': to_fixed(median([width(row, row['interval']) for row in members]), 6) if members else None,
            'mdape': ratio_metrics(pairs_for(members, primary))['mdape'] if members else None,
        })
    intervals = {
        'envelopeCoverage': share(primary_rows, lambda row: covered(row, row['envelope'])),
        'envelopeMedianWidth': to_fixed(median([width(row, row['envelope']) for row in primary_rows]), 6),
        'calibratedCoverage': share(primary_rows, lambda row: covered(row, row['interval'])),
        'calibratedMedianWidth': to_fixed(median([width(row, row['interval']) for row in primary_rows]), 6),
        'byTier': tiers,
    }

    ordered_actual = sorted(row['actual'] for row in rows)
    cuts = [quantile(ordered_actual, q) for q in (0, 0.25, 0.5, 0.75)]
    bands = []
    for i, low in enumerate(cuts):
        high = cuts[i + 1] if i < 3 else None
        members = [row for row in primary_rows if row['actual'] >= low and (high is None or row['actual'] < high)]
        bands.append({
            'band': f'Q{i + 1}',
            'from': js_round(low),
            'to': None if high is None else js_round(high),
            'n': len(members),
            'metrics': ratio_metrics(pairs_for(members, primary)),
        })

    holdout = {'screenedSales': len(rows), 'perVariant': per_variant, 'commonSet': common_set, 'paired': paired,
               'intervals': intervals, 'byPriceBand': bands}

    def metric_value(metric):
        main = per_variant[primary]
        if metric == 'valuedShare':
            return main['valuedShare']
        if metric == 'absMedianSignedError':
            return to_fixed(abs(main['metrics']['medianSignedError']), 6)
        if metric == 'calibratedCoverage':
            return intervals['calibratedCoverage']
        if metric.startswith('pairedMdapeDeltaUpper:'):
            match = next(item for item in paired if item['variant'] == primary and item['baseline'] == metric.split(':')[1])
            return match['ci95'][1] if 'ci95' in match else None
        return main['metrics'][metric]

    acceptance = []
    for criterion in protocol['acceptance']:
        value = metric_value(criterion['metric'])
        low, high = criterion.get('min'), criterion.get('max')
        passed = None if value is None else (math.isfinite(value) and (low is None or value >= low) and (high is None or value <= high))
        acceptance.append({'id': criterion['id'], 'value': value, 'passed': passed})
    return holdout, acceptance


# ---- Comparison ----

def mismatches(expected, actual, path=''):
    """Every place `actual` (recomputed) differs from `expected` (published). Keys absent from `actual` are skipped."""
    if isinstance(actual, dict):
        found = []
        for key, value in actual.items():
            if not isinstance(expected, dict) or key not in expected:
                found.append(f'{path}.{key}: missing from the report')
            else:
                found.extend(mismatches(expected[key], value, f'{path}.{key}'))
        return found
    if isinstance(actual, list):
        if not isinstance(expected, list) or len(expected) != len(actual):
            return [f'{path}: length differs']
        return [item for i, (e, a) in enumerate(zip(expected, actual)) for item in mismatches(e, a, f'{path}[{i}]')]
    if isinstance(actual, float) and math.isnan(actual):
        return [] if expected is None else [f'{path}: report {expected!r}, recomputed NaN']
    return [] if expected == actual else [f'{path}: report {expected!r}, recomputed {actual!r}']


def gunzip_text(path):
    with gzip.open(path, 'rb') as handle:
        return handle.read().decode('utf-8')


def dataset_fingerprints():
    found = {}
    for directory in (ROOT / 'evidence' / 'datasets', ROOT / 'src' / 'datasets'):
        for path in sorted(directory.rglob('*.csv.gz')):
            sha = hashlib.sha256(gunzip_text(path).encode('utf-8')).hexdigest()
            found.setdefault(sha, []).append(str(path.relative_to(ROOT)))
    return found


def check_report(path, bootstrap, fingerprints, log):
    report = json.loads(path.read_text(encoding='utf-8'))
    protocol = report['protocol']
    checks = []

    def check(label, passed, detail):
        checks.append({'label': label, 'passed': bool(passed), 'detail': detail})

    body = {key: value for key, value in report.items() if key != 'reportDigest'}
    recomputed = digest(body)
    check('Report digest', recomputed == report['reportDigest'], f"{report['reportDigest']} published; {recomputed} recomputed")
    protocol_digest = digest(protocol)
    check('Protocol digest', protocol_digest == report['protocolDigest'], f'{protocol_digest} recomputed')
    datasets = fingerprints.get(protocol['dataset']['csvSha256'], [])
    check('Dataset fingerprint', bool(datasets) and report['dataset']['csvSha256'] == protocol['dataset']['csvSha256'],
          f"{protocol['dataset']['csvSha256'][:16]}… matches {', '.join(datasets) or 'no bundled file'}")
    samples_path = ROOT / report['samples']['file']
    text = gunzip_text(samples_path)
    samples_sha = hashlib.sha256(text.encode('utf-8')).hexdigest()
    variants, rows = read_samples(text)
    check('Samples fingerprint', samples_sha == report['samples']['sha256'] and len(rows) == report['samples']['rows'],
          f"{report['samples']['file']}: {len(rows)} rows, sha256 {samples_sha[:16]}…")
    check('Samples cover every variant', variants == list(report['holdout']['perVariant']),
          f"columns {', '.join(variants)}")

    started = time.time()
    holdout, acceptance = rederive(report, rows, variants, bootstrap,
                                   progress=lambda message: log(f'  {protocol["id"]}: {message}'))
    published = report['holdout']
    for label, key in (('Valued share, error and ratio metrics', 'perVariant'), ('Common-set metrics', 'commonSet'),
                       ('Paired comparisons', 'paired'), ('Interval coverage and width', 'intervals'),
                       ('Sale-price quartiles', 'byPriceBand'), ('Screened holdout count', 'screenedSales')):
        found = mismatches(published[key], holdout[key], key)
        check(label, not found, '; '.join(found[:3]) or ('exact' + (', bootstrap included' if bootstrap and key in ('perVariant', 'paired') else '')))
    acceptance_found = []
    for item, mine in zip(report['acceptance'], acceptance):
        if item['id'] != mine['id']:
            acceptance_found.append(f"{item['id']}: order differs")
        elif mine['value'] is not None and (item['value'] != mine['value'] or item['passed'] != mine['passed']):
            acceptance_found.append(f"{item['id']}: report {item['value']} {item['passed']}, recomputed {mine['value']} {mine['passed']}")
    verdicts = [item['passed'] for item in acceptance if item['passed'] is not None]
    overall = all(item['passed'] for item in report['acceptance'])
    check('Acceptance values and verdicts', not acceptance_found and len(report['acceptance']) == len(acceptance)
          and report['accepted'] == overall,
          '; '.join(acceptance_found) or f"{sum(verdicts)} of {len(verdicts)} recomputed criteria met; accepted={report['accepted']}"
          + ('' if bootstrap else ' (paired bounds need the bootstrap)'))
    primary = holdout['perVariant'][protocol['primaryVariant']]
    return {
        'report': str(path.relative_to(ROOT)),
        'protocol': protocol['id'],
        'reportDigest': report['reportDigest'],
        'accepted': report['accepted'],
        'primary': {'valuedShare': primary['valuedShare'], **primary['metrics']},
        'bootstrap': bootstrap,
        'seconds': round(time.time() - started, 1),
        'checks': checks,
        'passed': all(item['passed'] for item in checks),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('reports', nargs='*', help='report JSON files (default: every evidence/valuation-validation*.json)')
    parser.add_argument('--quick', action='store_true', help='skip the bootstrap intervals')
    parser.add_argument('--json', help='also write a machine-readable summary here')
    parser.add_argument('--prng', nargs=3, type=int, metavar=('SEED', 'N', 'DRAWS'), help='print bootstrap indices and exit')
    args = parser.parse_args()
    if args.prng:
        seed, n, draws = args.prng
        print(json.dumps(list(bootstrap_draws(n, draws, seed))))
        return 0
    paths = [pathlib.Path(item).resolve() for item in args.reports] or sorted((ROOT / 'evidence').glob('valuation-validation*.json'))
    log = lambda message: print(message, file=sys.stderr, flush=True)  # noqa: E731
    fingerprints = dataset_fingerprints()
    results = []
    for path in paths:
        log(f'{path.relative_to(ROOT)}: re-deriving{"" if args.quick else " with the exact bootstrap"}…')
        result = check_report(path, not args.quick, fingerprints, log)
        results.append(result)
        primary = result['primary']
        print(f"{result['protocol']}  report {result['reportDigest'][:23]}…  accepted={result['accepted']}")
        print(f"  primary: valued {primary['valuedShare']:.2%}, MdAPE {primary['mdape']:.2%}, PPE10 {primary['ppe10']:.2%}, "
              f"COD {primary['cod']:.2f}, PRD {primary['prd']:.3f}  ({result['seconds']}s)")
        for item in result['checks']:
            print(f"  {'PASS' if item['passed'] else 'FAIL'}  {item['label']} — {item['detail']}")
    passed = all(result['passed'] for result in results)
    print(f"\n{'All' if passed else 'NOT all'} {len(results)} reports re-derived "
          f"{'and matched' if passed else 'matched'}{' (bootstrap skipped)' if args.quick else ''}.")
    if args.json:
        summary = {'tool': 'scripts/replication/rederive.py', 'python': sys.version.split()[0], 'bootstrap': not args.quick,
                   'passed': passed, 'reports': results}
        pathlib.Path(args.json).write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
