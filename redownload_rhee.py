import requests
import re
import os
import time
from io import BytesIO
from PIL import Image

save_dir = r'C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\images\rhee'

# Known brand prefixes for search queries
BRAND_SEARCH = {
    'NONGSHIM': 'NONGSHIM',
    'SAMYANG': 'SAMYANG',
    'ORION': 'ORION',
    'LOTTE': 'LOTTE',
    'RHEECHUN': 'ASSI',
    'SEMPIO': 'SEMPIO',
    'DONGWON': 'DONGWON',
    'OTTOGI': 'OTTOGI',
    'OTOKI': 'OTTOGI',
    'BINGGRAE': 'BINGGRAE',
    'PALDO': 'PALDO',
    'CHUNGJUNGONE': 'CHUNGJUNGONE',
    'TAOKAENOI': 'TAOKAENOI',
    'HUYFONG': 'HUY FONG',
    'MAEPLOY': 'MAE PLOY',
    'SAMLIP': 'SAMLIP',
    'JONGGAVISION': 'JONGGA',
    'CROWN': 'CROWN',
    'HAITAI': 'HAITAI',
    'GOMPYO': 'GOMPYO',
    'CJ': 'CJ',
    'BIBIGO': 'BIBIGO',
    'PULMUONE': 'PULMUONE',
    'HAIOREUM': 'HAIOREUM',
}

def get_search_query(brand, name):
    """Build the search query based on brand."""
    search_brand = BRAND_SEARCH.get(brand, 'ASSI')
    # Clean name - remove size info in parentheses at end for cleaner search
    clean_name = re.sub(r'\s*\([^)]*(?:#|LB|OZ|ML|L|G|KG|P|PC|CT|CS|BTL|CAN|PKG)[^)]*\)\s*$', '', name, flags=re.IGNORECASE)
    clean_name = re.sub(r'\s*\(\d+[PpKk]\)\s*$', '', clean_name)
    # Remove trailing size descriptors like (S), (M), (L), (XL)
    clean_name = re.sub(r'\s*\((S|M|L|XL|XXL)\)\s*$', '', clean_name)
    if not clean_name.strip():
        clean_name = name
    return f'{search_brand} {clean_name} product package'

def search_and_download(item_code, query):
    """Search Bing and download the first valid image."""
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    url = f'https://www.bing.com/images/search?q={requests.utils.quote(query)}&first=1&count=10'
    try:
        r = requests.get(url, headers=headers, timeout=15)
        matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+?\.(?:jpg|jpeg|png))', r.text)
        for img_url in matches[:5]:
            try:
                img_r = requests.get(img_url, headers=headers, timeout=10)
                if img_r.status_code == 200 and len(img_r.content) > 5000:
                    img = Image.open(BytesIO(img_r.content))
                    img = img.convert('RGB')
                    ratio = min(300 / img.width, 300 / img.height)
                    if ratio < 1:
                        img = img.resize((int(img.width * ratio), int(img.height * ratio)))
                    img.save(os.path.join(save_dir, f'{item_code}.jpg'), 'JPEG', quality=85)
                    return True
            except Exception:
                continue
    except Exception:
        pass
    return False

# Read products.js and extract all Bing-downloaded items
with open(r'C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\products.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all products with item_code.jpg images (not image*.jpg, half_*.jpg, page_*.jpg)
pattern = r'id:\s*"([^"]+)",\s*brand:\s*"([^"]+)",\s*name:\s*"([^"]+)".*?image:\s*"images/rhee/(?!image|half_|page_)([^"]+)"'
items = re.findall(pattern, content)

print(f"Found {len(items)} Bing-downloaded items to re-download")

success = 0
failed = 0
failed_items = []

for i, (item_id, brand, name, filename) in enumerate(items):
    item_code = filename.replace('.jpg', '')
    query = get_search_query(brand, name)
    print(f"[{i+1}/{len(items)}] {item_code} ({brand}) - {name}")
    print(f"  Query: {query}")

    result = search_and_download(item_code, query)
    if result:
        success += 1
        print(f"  SUCCESS")
    else:
        failed += 1
        failed_items.append((item_code, brand, name))
        print(f"  FAILED")

    # Small delay to avoid rate limiting
    if i % 10 == 9:
        time.sleep(1)

print(f"\n=== COMPLETE ===")
print(f"Success: {success}")
print(f"Failed: {failed}")
if failed_items:
    print(f"\nFailed items:")
    for code, brand, name in failed_items:
        print(f"  {code} ({brand}) - {name}")
