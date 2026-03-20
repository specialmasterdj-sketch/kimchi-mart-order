"""
Download product images from Bing Image Search for Rhee Bros items missing photos.
Processes items in batches with delays to avoid rate limiting.
Resizes images to max 300px wide.
"""

import requests, re, os, time, json, sys
from PIL import Image
from io import BytesIO
from urllib.parse import quote

PRODUCTS_FILE = "C:/Users/speci/OneDrive/Desktop/kimchi-mart-order/products.js"
IMAGE_DIR = "C:/Users/speci/OneDrive/Desktop/kimchi-mart-order/images/rhee"
RESULTS_FILE = "C:/Users/speci/OneDrive/Desktop/kimchi-mart-order/download_results.json"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def get_rhee_products_without_images():
    """Parse products.js and return Rhee Bros items with no image that have brand or name."""
    with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    rhee_start = content.find('rhee: {')
    prod_start = content.find('products: [', rhee_start)
    chori_start = content.find('choripdong:', rhee_start)
    wang_start = content.find('wang:', rhee_start)
    next_vendor = min(x for x in [chori_start, wang_start] if x > 0)
    rhee_section = content[prod_start:next_vendor]

    pattern = r'\{ id: "([^"]*)", brand: "([^"]*)", name: "([^"]*)", nameKr: "([^"]*)", size: "([^"]*)", category: "([^"]*)", avgQty: [^,]*, price: [^,]*, image: "" \}'
    matches = re.findall(pattern, rhee_section)

    # Filter: must have brand or name
    items = []
    for m in matches:
        item_id, brand, name, nameKr, size, category = m
        if brand or name:
            items.append({
                'id': item_id,
                'brand': brand,
                'name': name,
                'nameKr': nameKr,
                'size': size,
                'category': category
            })
    return items


def clean_product_name(name):
    """Clean product name for search query - remove size info in parens, codes, etc."""
    # Remove size/weight info in parentheses like (5#), (30 OZ), (2.2#), etc.
    cleaned = re.sub(r'\([^)]*(?:#|LB|OZ|ML|L|G|KG|CT|PK|PC)[^)]*\)', '', name, flags=re.IGNORECASE)
    # Remove remaining parenthetical codes like (NEW), (USA), etc.
    cleaned = re.sub(r'\([^)]*\)', '', cleaned)
    # Remove underscores and extra whitespace
    cleaned = cleaned.replace('_', ' ').strip()
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned


def build_search_query(item):
    """Build an effective search query for Bing Images."""
    brand = item['brand']
    name = clean_product_name(item['name'])

    # Map common brand names to more searchable versions
    brand_map = {
        'CHUNGJUNGONE': 'Chung Jung One',
        'HANKUKMI': 'Hankuk Mi',
        'RHEECHUN': 'Rhee Chun',
        'THREEELEPHANTS': 'Three Elephants',
        'VINHTHUAN': 'Vinh Thuan',
        'TAOKAENOI': 'Tao Kae Noi',
        'NONGSHIM': 'Nongshim',
        'OTTOGI': 'Ottogi',
        'SAMYANG': 'Samyang',
        'DONGWON': 'Dongwon',
        'PULMUONE': 'Pulmuone',
        'PALDO': 'Paldo',
        'BIBIGO': 'Bibigo',
        'HAIOREUM': 'Hai O Reum',
        'KIKKOMAN': 'Kikkoman',
        'SEMPIO': 'Sempio',
        'LOTTE': 'Lotte',
        'ORION': 'Orion',
        'HAITAI': 'Haitai',
        'CROWN': 'Crown',
        'BINGGRAE': 'Binggrae',
        'JINRO': 'Jinro',
        'HITEJINRO': 'Hite Jinro',
        'BAEDAEGAM': 'Baedaegam',
        'GOMPYO': 'Gompyo',
        'QONE': 'Q One',
        'CAIYUNXUAN': 'Caiyunxuan',
        'EVERGREEN': 'Evergreen',
        'AROYD': 'Aroy-D',
        'COCK': 'Cock Brand',
        'RAMA': 'Rama',
    }

    search_brand = brand_map.get(brand, brand.title() if brand else '')

    if search_brand and name:
        query = f"{search_brand} {name} product"
    elif name:
        query = f"{name} asian food product"
    else:
        query = f"{search_brand} food product"

    return query


def search_bing_image(query, retries=2):
    """Search Bing Images and return first valid image URL."""
    for attempt in range(retries):
        try:
            url = f'https://www.bing.com/images/search?q={quote(query)}&first=1&qft=+filterui:photo-photo'
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                # Try multiple URL patterns
                matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+?\.(?:jpg|jpeg|png|webp))', r.text, re.IGNORECASE)
                if matches:
                    # Filter out tiny/icon images and suspicious URLs
                    for m in matches[:5]:
                        if 'logo' not in m.lower() and 'icon' not in m.lower() and 'avatar' not in m.lower():
                            return m
                    return matches[0]
            if attempt < retries - 1:
                time.sleep(2)
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
    return None


def download_and_resize(url, filepath, max_width=300):
    """Download image, resize to max_width, save as JPEG."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200 or len(r.content) < 1000:
            return False

        img = Image.open(BytesIO(r.content))

        # Convert to RGB if needed (for PNG with alpha, WEBP, etc.)
        if img.mode in ('RGBA', 'P', 'LA'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[-1] if 'A' in img.mode else None)
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Resize if wider than max_width
        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), Image.LANCZOS)

        # Save as JPEG
        img.save(filepath, 'JPEG', quality=85, optimize=True)
        return True
    except Exception as e:
        return False


def load_results():
    """Load previous results if they exist."""
    if os.path.exists(RESULTS_FILE):
        with open(RESULTS_FILE, 'r') as f:
            return json.load(f)
    return {'success': {}, 'failed': []}


def save_results(results):
    """Save results to JSON for tracking."""
    with open(RESULTS_FILE, 'w') as f:
        json.dump(results, f, indent=2)


def process_batch(items, start_idx, batch_size, results):
    """Process a batch of items."""
    end_idx = min(start_idx + batch_size, len(items))
    batch = items[start_idx:end_idx]

    success_count = 0
    fail_count = 0

    for i, item in enumerate(batch):
        item_id = item['id']

        # Skip if already downloaded
        filepath = os.path.join(IMAGE_DIR, f"{item_id}.jpg")
        if item_id in results['success'] or os.path.exists(filepath):
            print(f"  [{start_idx+i+1}] SKIP {item_id} (already exists)")
            success_count += 1
            continue

        query = build_search_query(item)
        print(f"  [{start_idx+i+1}] {item_id} | {item['brand']} {item['name'][:40]} | Query: {query[:60]}")

        img_url = search_bing_image(query)
        if img_url:
            if download_and_resize(img_url, filepath):
                results['success'][item_id] = {
                    'query': query,
                    'url': img_url,
                    'file': f"images/rhee/{item_id}.jpg"
                }
                print(f"         -> OK")
                success_count += 1
            else:
                # Try Korean name as fallback
                if item['nameKr']:
                    query2 = f"{item['nameKr']} 제품"
                    img_url2 = search_bing_image(query2)
                    if img_url2 and download_and_resize(img_url2, filepath):
                        results['success'][item_id] = {'query': query2, 'url': img_url2, 'file': f"images/rhee/{item_id}.jpg"}
                        print(f"         -> OK (Korean)")
                        success_count += 1
                    else:
                        results['failed'].append(item_id)
                        print(f"         -> FAIL (download)")
                        fail_count += 1
                else:
                    results['failed'].append(item_id)
                    print(f"         -> FAIL (download)")
                    fail_count += 1
        else:
            # Try simpler query
            simple_query = f"{item['brand']} {clean_product_name(item['name'])}"
            img_url = search_bing_image(simple_query)
            if img_url and download_and_resize(img_url, filepath):
                results['success'][item_id] = {'query': simple_query, 'url': img_url, 'file': f"images/rhee/{item_id}.jpg"}
                print(f"         -> OK (simple)")
                success_count += 1
            else:
                results['failed'].append(item_id)
                print(f"         -> FAIL (no results)")
                fail_count += 1

        # Delay between requests
        time.sleep(1.5)

    save_results(results)
    return success_count, fail_count


def main():
    os.makedirs(IMAGE_DIR, exist_ok=True)

    items = get_rhee_products_without_images()
    print(f"Total targetable items: {len(items)}")

    results = load_results()
    print(f"Previously downloaded: {len(results['success'])}")

    batch_size = 50
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end = int(sys.argv[2]) if len(sys.argv) > 2 else len(items)

    total_success = 0
    total_fail = 0

    for batch_start in range(start, end, batch_size):
        batch_num = batch_start // batch_size + 1
        print(f"\n=== Batch {batch_num} (items {batch_start+1}-{min(batch_start+batch_size, end)}) ===")
        s, f = process_batch(items, batch_start, batch_size, results)
        total_success += s
        total_fail += f
        print(f"Batch result: {s} success, {f} fail")

        # Longer pause between batches
        if batch_start + batch_size < end:
            print("Pausing 3s between batches...")
            time.sleep(3)

    print(f"\n=== FINAL: {total_success} success, {total_fail} fail out of {end-start} items ===")
    print(f"Total downloaded so far: {len(results['success'])}")


if __name__ == '__main__':
    main()
