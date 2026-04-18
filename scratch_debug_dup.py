import requests
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0"})

# The account page chunk would be at a predictable path pattern.
# In Next.js App Router, the path is:
# /_next/static/chunks/app/[locale]/dashboard/account/[id]/page-HASH.js
# But [locale] is encoded as %5Blocale%5D and [id] as %5Bid%5D

# Let's try to find the webpack-runtime or _buildManifest to get chunk mappings
html = session.get("https://www.ironrisk.pro/es/login", timeout=15).text

# Find the webpack runtime - it contains the chunk hash map
webpack_chunk = re.search(r'src="(/_next/static/chunks/webpack-[^"]+\.js)"', html)
if webpack_chunk:
    url = f"https://www.ironrisk.pro{webpack_chunk.group(1)}"
    js = session.get(url, timeout=10).content.decode('utf-8', errors='ignore')
    print(f"Webpack runtime: {len(js)} bytes")
    
    # Extract the chunk hash map - it maps chunk IDs to their hashes
    # Pattern: {chunkId: "hash", ...}
    # Find the object that maps numeric IDs to hashes
    hash_maps = re.findall(r'\{(\d+:"[0-9a-f]+"(?:,\d+:"[0-9a-f]+")*)\}', js)
    for hm in hash_maps:
        if len(hm) > 100:  # Only interesting large maps
            entries = re.findall(r'(\d+):"([0-9a-f]+)"', hm)
            print(f"\nChunk hash map ({len(entries)} entries):")
            for cid, chash in entries[:30]:
                print(f"  {cid}: {chash}")
            if len(entries) > 30:
                print(f"  ... and {len(entries)-30} more")

# Also try to find the _ssgManifest 
# Build ID is needed - extract from any chunk path
build_id_match = re.search(r'/_next/static/([a-zA-Z0-9_-]+)/_', html)
if build_id_match:
    build_id = build_id_match.group(1)
    print(f"\nBuild ID: {build_id}")

print("\n--- DONE ---")
