#!/usr/bin/env python3
# Generate a minimal resources.arsc (without aapt2) that defines one resource:
#   @mipmap/ic_launcher  ->  "res/mipmap/ic_launcher.png"  (id 0x7f010000)
# Referenced by android:icon in the manifest. Validated with androguard.
import struct, sys

PKG_ID = 0x7F
PKG_NAME = "com.godagent.app"
TYPE_NAME = "mipmap"
KEY_NAME = "ic_launcher"
VALUE = "res/mipmap/ic_launcher.png"

def str_pool(strings, utf8=False):
    # UTF-16 string pool (flags=0). header 28 bytes.
    data = b""
    offsets = []
    for s in strings:
        offsets.append(len(data))
        data += struct.pack("<H", len(s)) + s.encode("utf-16-le") + b"\x00\x00"
    while len(data) % 4:
        data += b"\x00"
    off_table = b"".join(struct.pack("<I", o) for o in offsets)
    strings_start = 28 + len(off_table)
    size = strings_start + len(data)
    header = struct.pack("<HHIIIIII", 0x0001, 28, size, len(strings), 0, 0, strings_start, 0)
    return header + off_table + data

# ---- global value string pool ----
gpool = str_pool([VALUE])

# ---- type + key string pools (inside package) ----
type_pool = str_pool([TYPE_NAME])
key_pool = str_pool([KEY_NAME])

# ---- typeSpec chunk (0x0202) ----
def typespec():
    entry_count = 1
    body = struct.pack("<BBHI", 1, 0, 0, entry_count) + struct.pack("<I", 0)  # one config-flags entry
    size = 8 + len(body)
    return struct.pack("<HHI", 0x0202, 16, size) + body

# ---- type chunk (0x0201) with one entry ----
def type_chunk():
    entry_count = 1
    config = struct.pack("<I", 56) + b"\x00" * 52  # size=56, all-default config
    header_size = 8 + 4 + 4 + 4 + len(config)      # 8 + id/res0/res1 + entryCount + entriesStart + config
    entries_start = header_size + entry_count * 4
    # entry: ResTable_entry(size=8, flags=0, key=0) + Res_value(size=8, res0=0, type=STRING(3), data=0)
    entry = struct.pack("<HHI", 8, 0, 0) + struct.pack("<HBBI", 8, 0, 0x03, 0)
    offsets = struct.pack("<I", 0)
    body_after_header = offsets + entry
    size = header_size + len(body_after_header)
    header = (struct.pack("<HHI", 0x0201, header_size, size)
              + struct.pack("<BBHI I", 1, 0, 0, entry_count, entries_start)
              + config)
    return header + body_after_header

# ---- package chunk (0x0200) ----
def package_chunk():
    header_size = 0x120  # 288: includes typeIdOffset
    name_bytes = PKG_NAME.encode("utf-16-le")
    name_field = name_bytes + b"\x00" * (256 - len(name_bytes))
    # type/key string pools follow the header
    tpool = type_pool
    kpool = key_pool
    type_strings_off = header_size
    key_strings_off = header_size + len(tpool)
    body = typespec() + type_chunk()
    fixed = (struct.pack("<I", PKG_ID) + name_field
             + struct.pack("<I", type_strings_off) + struct.pack("<I", 0)
             + struct.pack("<I", key_strings_off) + struct.pack("<I", 0)
             + struct.pack("<I", 0))  # typeIdOffset
    assert 8 + len(fixed) == header_size, (8 + len(fixed), header_size)
    content = tpool + kpool + body
    size = header_size + len(content)
    header = struct.pack("<HHI", 0x0200, header_size, size) + fixed
    return header + content

pkg = package_chunk()

# ---- table ----
body = struct.pack("<I", 1) + gpool + pkg  # packageCount=1 + global pool + package
size = 8 + len(body)
table = struct.pack("<HHI", 0x0002, 12, size) + body
open(sys.argv[1], "wb").write(table)
print("wrote", sys.argv[1], size, "bytes")
