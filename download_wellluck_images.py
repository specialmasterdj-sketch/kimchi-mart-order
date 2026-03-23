import sys
import io
import os
import re
import json
import time
import requests
from PIL import Image
from io import BytesIO
from urllib.parse import quote_plus

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

SAVE_DIR = r'C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\images\wellluck'
PRODUCTS_JSON = r'C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\wellluck_products.json'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

def clean_product_name(name):
    """Extract a clean search-friendly product name."""
    # Remove quantity/size patterns like 6/20, 12/500, 24/16 OZ, 10/2 LB, etc.
    cleaned = re.sub(r'\d+/\d+[\s]*(?:CT|PC|PCS|OZ|LB|LBS|ML|G|GM|GAL|LITER|FL|BOWLS|BAGS|MESH)?\b', '', name)
    # Remove size patterns like (5#), (#1), etc.
    cleaned = re.sub(r'\([^)]*\)', '', cleaned)
    # Remove item codes like #001, #2034, etc. but keep brand-meaningful ones
    cleaned = re.sub(r'#\d+\w*', '', cleaned)
    # Remove FOIL BAGS, FOIL TEABAG patterns
    cleaned = re.sub(r'FOIL\s*(BAGS?|TEABAGS?)', '', cleaned)
    # Remove CS, BD, BG, EA, CB size units at word boundaries
    cleaned = re.sub(r'\b(CS|BD|BG|EA|CB)\b', '', cleaned)
    # Clean up extra whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def build_search_query(product):
    """Build a search query from product info."""
    name = product['name']
    cleaned = clean_product_name(name)

    # For Ahmad tea products, simplify
    if 'AHMAD' in name:
        # Extract tea flavor
        match = re.search(r'AHMAD\s+TEA\s+(.+?)$', cleaned)
        if match:
            flavor = match.group(1).strip()
            return f"Ahmad Tea {flavor} tea box"
        return f"Ahmad Tea {cleaned}"

    # For specific known brands, build targeted queries
    brand_map = {
        'OKF': 'OKF',
        'MAMA': 'MAMA noodle',
        'PEKING': 'Peking frozen bun',
        'CHACHA': 'ChaCha snack',
        'HUY FONG': 'Huy Fong',
        'PANTAI': 'Pantai',
        'WANJASHAN': 'Wan Ja Shan',
        'KC': 'KC brand',
        'KOKUHO': 'Kokuho Rice',
        'ERAWAN': 'Erawan',
        'KONG YEN': 'Kong Yen',
        'LAGO': 'Lago wafer',
        'FORTUNE AVE': 'Fortune Avenue dumpling',
        'O\'TASTY': "O'Tasty frozen",
        'HUNSTY': 'Hunsty frozen',
        'SPRING HOME': 'Spring Home',
        'SWEETY': 'Sweety mochi ice cream',
        'SHAO MEI': 'Shao Mei ice bar',
        'MORI NU': 'Mori-Nu tofu',
        'JML': 'JML instant noodle',
        'HUA LONG': 'JML instant noodle',
        'GOURMET MASTER': 'Gourmet Master noodle',
        'SILVER SWAN': 'Silver Swan',
        'HENG SHUN': 'Heng Shun vinegar',
        'RICE KING': 'Rice King',
        'SAVORY EXPRESS': 'Savory Express dim sum',
        'CANTON': 'Canton noodle',
        'YES': 'YES brand drink',
        'WANG DERM': 'Wang Derm Thai Tea',
        'C.P': 'CP Food wonton',
        'LIGO': 'Ligo sardines',
        'HEY SONG': 'Hey Song sarsaparilla',
        'MAEPLOY': 'Mae Ploy sweet chili sauce',
        'NEW CHOICE': 'New Choice broth',
        'LITTLE ALLEY': 'Little Alley frozen',
        'AMAY\'S': "Amay's almond cookies",
        'FRANKFORD': 'Frankford chocolate',
        'CHING YEH': 'Ching Yeh pork',
        'FORMOSA': 'Formosa pork fu',
        'VENUS': 'Venus meat ball',
        'WONG PAI': 'Wong Pai lychee',
        'YA FANG': 'Ya Fang panda ice cream',
        'WEIYEE': 'Wei Yee meat ball',
        'HAN CHA KAN': 'Han Cha Kan honey tea',
        'ARM & HAMMER': 'Arm & Hammer baking soda',
        'JINSHAN': 'Jinshan vinegar',
        'DRAGON': 'Dragon noodle',
    }

    # Check if any known brand appears in the name
    for brand_key, brand_query in brand_map.items():
        if brand_key in name:
            # Get the main product description
            desc = cleaned.replace(brand_key, '').strip()
            # Remove the brand from description if it appears again
            query = f"{brand_query} {desc}"
            query = re.sub(r'\s+', ' ', query).strip()
            return query + " product"

    # Default: use cleaned name
    return cleaned + " asian food product"


def get_bing_image_urls(query, num=5):
    """Search Bing Images and return image URLs."""
    search_url = f"https://www.bing.com/images/search?q={quote_plus(query)}&form=HDRSC2&first=1"

    try:
        resp = requests.get(search_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        html = resp.text

        # Find image URLs from Bing's response
        # Method 1: Look for murl in the page (media URL)
        urls = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', html)

        if not urls:
            # Method 2: Look for src attributes on img tags
            urls = re.findall(r'src="(https?://(?:tse|th\.bing)[^"]+)"', html)

        if not urls:
            # Method 3: Look for data-src or other image patterns
            urls = re.findall(r'src2="(https?://[^"]+)"', html)

        # Deduplicate while preserving order
        seen = set()
        unique_urls = []
        for u in urls:
            if u not in seen:
                seen.add(u)
                unique_urls.append(u)

        return unique_urls[:num]
    except Exception as e:
        print(f"  Search error: {e}")
        return []


def download_and_resize_image(url, save_path, max_width=300, quality=70):
    """Download image, resize, and save as JPEG."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15, stream=True)
        resp.raise_for_status()

        content_type = resp.headers.get('content-type', '')
        if 'html' in content_type or 'text' in content_type:
            return False

        img_data = resp.content
        if len(img_data) < 1000:  # Too small, probably not a real image
            return False

        img = Image.open(BytesIO(img_data))

        # Convert to RGB if necessary (for PNG with alpha, etc.)
        if img.mode in ('RGBA', 'P', 'LA', 'L'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'RGBA' or img.mode == 'LA':
                background.paste(img, mask=img.split()[-1])
            elif img.mode == 'P':
                img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1])
            else:
                background = img.convert('RGB')
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Resize if wider than max_width
        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), Image.LANCZOS)

        # Reject very small images (likely icons/thumbnails)
        if img.width < 50 or img.height < 50:
            return False

        img.save(save_path, 'JPEG', quality=quality)
        return True
    except Exception as e:
        return False


def process_batch(products, batch_start, batch_end):
    """Process a batch of products."""
    success = 0
    failed = 0
    skipped = 0

    for i in range(batch_start, min(batch_end, len(products))):
        product = products[i]
        pid = product['id']
        name = product['name']

        save_path = os.path.join(SAVE_DIR, f"{pid}.jpg")

        # Skip if already downloaded
        if os.path.exists(save_path):
            skipped += 1
            continue

        query = build_search_query(product)

        if (i - batch_start) % 10 == 0:
            print(f"  Progress: {i - batch_start}/{batch_end - batch_start} | Success: {success} | Failed: {failed} | Skipped: {skipped}")

        image_urls = get_bing_image_urls(query)

        if not image_urls:
            print(f"  [{pid}] No images found for: {query}")
            failed += 1
            time.sleep(1)
            continue

        downloaded = False
        for url in image_urls[:3]:  # Try up to 3 URLs
            if download_and_resize_image(url, save_path):
                downloaded = True
                break
            time.sleep(0.3)

        if downloaded:
            success += 1
        else:
            print(f"  [{pid}] Failed to download: {query}")
            failed += 1

        # Rate limiting
        time.sleep(1.5)

    return success, failed, skipped


def main():
    print("=== Well Luck Product Image Downloader ===")
    print(f"Save directory: {SAVE_DIR}")

    with open(PRODUCTS_JSON, 'r', encoding='utf-8') as f:
        products = json.load(f)

    print(f"Total products: {len(products)}")

    # Check how many already exist
    existing = sum(1 for p in products if os.path.exists(os.path.join(SAVE_DIR, f"{p['id']}.jpg")))
    print(f"Already downloaded: {existing}")
    print(f"Remaining: {len(products) - existing}")
    print()

    total_success = 0
    total_failed = 0
    total_skipped = 0

    batch_size = 50
    num_batches = (len(products) + batch_size - 1) // batch_size

    for batch_num in range(num_batches):
        batch_start = batch_num * batch_size
        batch_end = min(batch_start + batch_size, len(products))

        print(f"--- Batch {batch_num + 1}/{num_batches} (items {batch_start + 1}-{batch_end}) ---")

        success, failed, skipped = process_batch(products, batch_start, batch_end)
        total_success += success
        total_failed += failed
        total_skipped += skipped

        print(f"  Batch complete: {success} success, {failed} failed, {skipped} skipped")
        print()

        # Small delay between batches
        if batch_num < num_batches - 1:
            time.sleep(2)

    print("=== SUMMARY ===")
    print(f"Total success: {total_success}")
    print(f"Total failed: {total_failed}")
    print(f"Total skipped (already existed): {total_skipped}")
    print(f"Images in folder: {len([f for f in os.listdir(SAVE_DIR) if f.endswith('.jpg')])}")


if __name__ == '__main__':
    main()
