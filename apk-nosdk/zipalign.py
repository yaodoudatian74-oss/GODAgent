#!/usr/bin/env python3
# Minimal zipalign (4-byte) for an all-STORED APK, without the Android SDK.
# Android mmaps resources.arsc and uncompressed assets, so each entry's data
# must start on a 4-byte boundary. We re-emit the archive, padding each local
# header's extra field so its data offset is 4-aligned. Content is unchanged,
# so a prior v1 (jarsigner) signature stays valid.
import sys, struct, zipfile, time

ALIGN = 4

def main(src, dst):
    zin = zipfile.ZipFile(src, 'r')
    entries = []
    for zi in zin.infolist():
        data = zin.read(zi.filename)
        entries.append((zi, data))
    zin.close()

    out = open(dst, 'wb')
    central = []
    for zi, data in entries:
        name = zi.filename.encode('utf-8')
        # all entries STORED
        crc = zipfile.crc32(data) & 0xffffffff
        dt = zi.date_time
        dostime = (dt[3] << 11) | (dt[4] << 5) | (dt[5] // 2)
        dosdate = ((dt[0] - 1980) << 9) | (dt[1] << 4) | dt[2]
        offset = out.tell()
        # compute extra padding so data starts 4-aligned
        base = offset + 30 + len(name)
        pad = (-base) % ALIGN
        extra = b'\x00' * pad
        lh = struct.pack('<IHHHHHIIIHH',
                         0x04034b50, 20, 0, 0, dostime, dosdate,
                         crc, len(data), len(data), len(name), len(extra))
        out.write(lh); out.write(name); out.write(extra); out.write(data)
        central.append((name, crc, len(data), dostime, dosdate, offset))

    cd_start = out.tell()
    for name, crc, size, dostime, dosdate, offset in central:
        ch = struct.pack('<IHHHHHHIIIHHHHHII',
                         0x02014b50, 20, 20, 0, 0, dostime, dosdate,
                         crc, size, size, len(name), 0, 0, 0, 0, 0, offset)
        out.write(ch); out.write(name)
    cd_size = out.tell() - cd_start
    eocd = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0,
                       len(central), len(central), cd_size, cd_start, 0)
    out.write(eocd)
    out.close()
    print('aligned', dst, 'entries', len(central))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
