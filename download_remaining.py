"""
Download product images for Rhee Bros items still using shared catalog page images.
"""

import requests, re, os, time, json, sys
from PIL import Image
from io import BytesIO
from urllib.parse import quote
from collections import Counter

PRODUCTS_FILE = "C:/Users/speci/OneDrive/Desktop/kimchi-mart-order/products.js"
IMAGE_DIR = "C:/Users/speci/OneDrive/Desktop/kimchi-mart-order/images/rhee"
RESULTS_FILE = "C:/Users/speci/OneDrive/Desktop/kimchi-mart-order/download_results2.json"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

BRAND_MAP = {
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
    'ASSI': 'Assi',
    'YISSINE': 'Yissine',
    'OTOKI': 'Ottogi',
    'LKK': 'Lee Kum Kee',
    'HEALTHYBOY': 'Healthy Boy',
    'MAMA': 'Mama',
    'SAMLIP': 'Samlip',
    'SANJ': 'San-J',
    'JUFRAN': 'Jufran',
    'EXCELLENT': 'Excellent',
    'WAIWAI': 'Wai Wai',
    'VIETWAY': 'Vietway',
    'LUNGKOW': 'Lungkow',
    'EMPEROR': 'Emperor',
    'SONGHAK': 'Songhak',
    'HONGGANE': 'Honggane',
    'SAPPORO': 'Sapporo Ichiban',
    'FOODLENOODLE': 'Foodle Noodle',
    'KINMAI': 'Kinmai',
    'YISSINE': 'Yissine',
    'ARGO': 'Argo',
    'CJ': 'CJ',
    'HAECHANDLE': 'Haechandle',
    'DAESANG': 'Daesang',
    'BEKSUL': 'Beksul',
    'WOOMTREE': 'Woom Tree',
    'WANG': 'Wang',
    'TAEKYUNG': 'Taekyung',
    'ABC': 'ABC',
    'PANDAROO': 'Pandaroo',
    'MAGGI': 'Maggi',
    'TIPAROS': 'Tiparos',
    'MEGACHEF': 'Megachef',
    'SQUID': 'Squid Brand',
    'ROOSTER': 'Rooster',
    'HUYFONG': 'Huy Fong',
    'SRIRACHA': 'Sriracha',
    'TOBASCO': 'Tabasco',
    'KEWPIE': 'Kewpie',
    'MARUKAN': 'Marukan',
    'MIZKAN': 'Mizkan',
    'KADOYA': 'Kadoya',
    'MONGGO': 'Monggo',
    'HIME': 'Hime',
    'CHORIPDONG': 'Choripdong',
    'JAYONE': 'Jayone',
    'SURASANG': 'Surasang',
    'SINGSONG': 'Singsong',
    'NONGHYUP': 'Nonghyup',
    'SANGDUSANUP': 'Sangdu Sanup',
}


def get_products_needing_images():
    """Get Rhee Bros products that are still using shared catalog images."""
    with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    rhee_start = content.find('rhee: {')
    prod_start = content.find('products: [', rhee_start)
    chori_start = content.find('choripdong:', rhee_start)
    wang_start = content.find('wang:', rhee_start)
    next_vendor = min(x for x in [chori_start, wang_start] if x > 0)
    rhee_section = content[prod_start:next_vendor]

    pattern = r'\{ id: "([^"]*)", brand: "([^"]*)", name: "([^"]*)", nameKr: "([^"]*)", size: "([^"]*)", category: "([^"]*)", avgQty: [^,]*, price: [^,]*, image: "([^"]*)" \}'
    products = re.findall(pattern, rhee_section)

    img_counter = Counter(p[6] for p in products)

    items = []
    for p in products:
        item_id, brand, name, nameKr, size, category, image = p
        # Target products sharing catalog images AND have brand/name
        if 'half_' in image and img_counter[image] > 1 and (brand or name):
            # Skip if individual image already downloaded
            if not os.path.exists(os.path.join(IMAGE_DIR, f"{item_id}.jpg")):
                items.append({
                    'id': item_id,
                    'brand': brand,
                    'name': name,
                    'nameKr': nameKr,
                    'size': size,
                    'category': category,
                    'current_image': image
                })
    return items


def clean_product_name(name):
    cleaned = re.sub(r'\([^)]*(?:#|LB|OZ|ML|L|G|KG|CT|PK|PC)[^)]*\)', '', name, flags=re.IGNORECASE)
    cleaned = re.sub(r'\([^)]*\)', '', cleaned)
    cleaned = cleaned.replace('_', ' ').strip()
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned


def build_search_query(item):
    brand = item['brand']
    name = clean_product_name(item['name'])
    search_brand = BRAND_MAP.get(brand, brand.title() if brand else '')

    if search_brand and name:
        query = f"{search_brand} {name} product"
    elif name:
        query = f"{name} asian food product"
    else:
        query = f"{search_brand} food product"
    return query


def search_bing_image(query, retries=2):
    for attempt in range(retries):
        try:
            url = f'https://www.bing.com/images/search?q={quote(query)}&first=1&qft=+filterui:photo-photo'
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+?\.(?:jpg|jpeg|png|webp))', r.text, re.IGNORECASE)
                if matches:
                    for m in matches[:5]:
                        if 'logo' not in m.lower() and 'icon' not in m.lower() and 'avatar' not in m.lower():
                            return m
                    return matches[0]
            if attempt < retries - 1:
                time.sleep(2)
        except:
            if attempt < retries - 1:
                time.sleep(2)
    return None


def download_and_resize(url, filepath, max_width=300):
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200 or len(r.content) < 1000:
            return False
        img = Image.open(BytesIO(r.content))
        if img.mode in ('RGBA', 'P', 'LA'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[-1] if 'A' in img.mode else None)
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), Image.LANCZOS)
        img.save(filepath, 'JPEG', quality=85, optimize=True)
        return True
    except:
        return False


def load_results():
    if os.path.exists(RESULTS_FILE):
        with open(RESULTS_FILE, 'r') as f:
            return json.load(f)
    return {'success': {}, 'failed': []}


def save_results(results):
    with open(RESULTS_FILE, 'w') as f:
        json.dump(results, f, indent=2)


def main():
    os.makedirs(IMAGE_DIR, exist_ok=True)
    items = get_products_needing_images()
    print(f"Total items needing individual images: {len(items)}")

    results = load_results()
    print(f"Previously downloaded: {len(results['success'])}")

    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end = int(sys.argv[2]) if len(sys.argv) > 2 else len(items)
    batch_size = 50

    total_success = 0
    total_fail = 0

    for batch_start in range(start, end, batch_size):
        batch_end = min(batch_start + batch_size, end)
        batch = items[batch_start:batch_end]
        batch_num = batch_start // batch_size + 1
        print(f"\n=== Batch {batch_num} (items {batch_start+1}-{batch_end}) ===")

        for i, item in enumerate(batch):
            item_id = item['id']
            filepath = os.path.join(IMAGE_DIR, f"{item_id}.jpg")

            if item_id in results['success'] or os.path.exists(filepath):
                print(f"  [{batch_start+i+1}] SKIP {item_id}")
                total_success += 1
                continue

            query = build_search_query(item)
            print(f"  [{batch_start+i+1}] {item_id} | {item['brand']} {item['name'][:40]} | Q: {query[:55]}")

            img_url = search_bing_image(query)
            if img_url:
                if download_and_resize(img_url, filepath):
                    results['success'][item_id] = {'query': query, 'file': f"images/rhee/{item_id}.jpg"}
                    print(f"         -> OK")
                    total_success += 1
                else:
                    # Try simpler query
                    simple = f"{BRAND_MAP.get(item['brand'], item['brand'])} {clean_product_name(item['name'])}"
                    img_url2 = search_bing_image(simple)
                    if img_url2 and download_and_resize(img_url2, filepath):
                        results['success'][item_id] = {'query': simple, 'file': f"images/rhee/{item_id}.jpg"}
                        print(f"         -> OK (retry)")
                        total_success += 1
                    else:
                        results['failed'].append(item_id)
                        print(f"         -> FAIL")
                        total_fail += 1
            else:
                simple = f"{BRAND_MAP.get(item['brand'], item['brand'])} {clean_product_name(item['name'])}"
                img_url = search_bing_image(simple)
                if img_url and download_and_resize(img_url, filepath):
                    results['success'][item_id] = {'query': simple, 'file': f"images/rhee/{item_id}.jpg"}
                    print(f"         -> OK (simple)")
                    total_success += 1
                else:
                    results['failed'].append(item_id)
                    print(f"         -> FAIL")
                    total_fail += 1

            time.sleep(1.5)

        save_results(results)
        print(f"Batch done: cumulative {total_success} success, {total_fail} fail")
        if batch_start + batch_size < end:
            time.sleep(3)

    print(f"\n=== FINAL: {total_success} success, {total_fail} fail out of {end-start} items ===")
    print(f"Total in results: {len(results['success'])}")


if __name__ == '__main__':
    main()
