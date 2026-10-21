"""One-time owner-approved cleanup. No site assets or retained backups are eligible."""
import json
import re
import subprocess

REMOVE = {
    'd85745a3132b9ac818d1d73ec1c255102cbedeb1': 82715342,
    '50b43cb42acb4e0ce74162560ef4995c9a4a6de3': 84010005,
    '9a090b0e44275baefe547f3409da5269e0c56703': 84010155,
    'a4fc87f3eac5fcba0beb3c195bad643a2b1ca8a2': 84011097,
    '8559de3dc1b86ac1e5943e3d72194785abacf583': 83982396,
    '38989d269f2dec936fe615b66254aedf400adc10': 83982696,
    '6068a95d67a42b3b193349ea3900d6659ba55593': 84010157,
    '9dfd81eeedce153a094497a2adfd68813a2b07ec': 84010085,
}
KEEP = {
    '9583ce107954565a8543a6d96edd3cf66064e3e4': 84008578,
    'ee627d294892c17a70ed16503134ad385ecb298b': 86613421,
    '334e7ddbaab8593f1d4ca9699972034341de8f5f': 86586109,
}


def aws(operation, *args):
    call = subprocess.run(['aws', 's3api', operation, '--bucket', 'gamescout-ru-site',
        '--endpoint-url', 'https://storage.yandexcloud.net', '--output', 'json', *args],
        capture_output=True, text=True, timeout=180)
    if call.returncode:
        raise RuntimeError(f'{operation} failed: {call.stderr[-800:]}')
    return json.loads(call.stdout or '{}')


def inventory():
    return {obj['Key']: obj for obj in aws('list-objects-v2').get('Contents', [])}


def selected(objects, sha, expected_size, required=False):
    rows = [obj for key, obj in objects.items() if key.startswith(f'_deployment-backups/{sha}/')]
    if not rows and not required:
        return []  # Idempotent if this approved archive has already been removed.
    assert len(rows) == 1, f'Unexpected archive count for {sha}: {len(rows)}'
    obj = rows[0]
    assert re.fullmatch(r'_deployment-backups/[a-f0-9]{40}/[0-9]+-[0-9]+/site-rollback.tar.gz', obj['Key'])
    assert obj['Size'] == expected_size, f'Archive size changed: {sha}'
    return rows


def main():
    assert not (REMOVE.keys() & KEEP.keys())
    before = inventory()
    keep = [selected(before, sha, size, required=True)[0] for sha, size in KEEP.items()]
    for obj in keep:
        head = aws('head-object', '--key', obj['Key'])
        assert head['ContentLength'] == obj['Size']
    remove = [obj for sha, size in REMOVE.items() for obj in selected(before, sha, size)]
    print('APPROVED_PLAN', json.dumps({'remove': [obj['Key'] for obj in remove],
        'retained': [obj['Key'] for obj in keep], 'bytesToFree': sum(obj['Size'] for obj in remove)}), flush=True)
    # No mutation occurs before every retained and eligible archive has been checked.
    for obj in remove:
        aws('delete-object', '--key', obj['Key'])
        print('DELETED', obj['Key'], flush=True)
    after = inventory()
    for sha, size in KEEP.items():
        selected(after, sha, size, required=True)
    for sha, size in REMOVE.items():
        assert not selected(after, sha, size), f'Approved archive still listed: {sha}'
    deleted_keys = {obj['Key'] for obj in remove}
    for key, obj in before.items():
        if key not in deleted_keys:
            assert key in after and after[key]['Size'] == obj['Size'], f'Unrelated object changed: {key}'
    print('CLEANUP_VERIFIED', json.dumps({'archivesDeleted': len(remove),
        'bytesFreed': sum(obj['Size'] for obj in remove), 'controlArchivesKept': len(keep),
        'bucketBytesAfter': sum(obj['Size'] for obj in after.values())}), flush=True)


if __name__ == '__main__':
    main()
