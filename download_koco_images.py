import sys
import io
import os
import re
import time
import html
import requests
from urllib.parse import quote_plus
from PIL import Image
from io import BytesIO

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

IMAGES_DIR = r"C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\images\koco"
PRODUCTS_FILE = r"C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\products.js"

os.makedirs(IMAGES_DIR, exist_ok=True)

# Read products.js and extract koco_trading products
with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the koco_trading section
koco_match = re.search(r'koco_trading:\s*\{.*?products:\s*\[(.*?)\]\s*\}', content, re.DOTALL)
if not koco_match:
    print("ERROR: Could not find koco_trading section")
    sys.exit(1)

products_text = koco_match.group(1)

# Extract all products with id and name
products = []
for m in re.finditer(r'\{\s*id:\s*"([^"]+)".*?name:\s*"([^"]+)"', products_text):
    pid = m.group(1)
    name = m.group(2)
    products.append((pid, name))

print(f"Found {len(products)} KOCO Trading products")

# Skip items that are just barcodes or freight charges
skip_ids = {"8809037041268", "8809411187162", "8807820007279", "F/C"}

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

def get_image_url_from_bing(query):
    """Search Bing Images and extract the first image URL from results."""
    search_url = f"https://www.bing.com/images/search?q={quote_plus(query)}&form=HDRSC2&first=1"
    try:
        resp = requests.get(search_url, headers=headers, timeout=15)
        resp.raise_for_status()
        text = resp.text

        # Bing uses HTML entities in JSON data attributes
        # Pattern: murl&quot;:&quot;URL&quot;
        murl_matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+)', text)
        if murl_matches:
            # Decode HTML entities
            urls = [html.unescape(u) for u in murl_matches]
            # Prefer image file extensions
            for url in urls[:10]:
                if any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                    return url
            return urls[0]

        return None
    except Exception as e:
        return None


def download_and_save_image(url, filepath):
    """Download image, resize to max 300px wide, save as JPEG quality 70."""
    try:
        resp = requests.get(url, headers={
            "User-Agent": headers["User-Agent"],
            "Referer": "https://www.bing.com/"
        }, timeout=15)
        resp.raise_for_status()

        # Check content type
        ct = resp.headers.get('Content-Type', '')
        if 'html' in ct.lower():
            return False

        img = Image.open(BytesIO(resp.content))

        # Convert to RGB if necessary
        if img.mode in ('RGBA', 'P', 'LA'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            if 'A' in img.mode:
                background.paste(img, mask=img.split()[-1])
            else:
                background.paste(img)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Resize to max 300px wide
        if img.width > 300:
            ratio = 300 / img.width
            new_height = int(img.height * ratio)
            img = img.resize((300, new_height), Image.LANCZOS)

        img.save(filepath, 'JPEG', quality=70)
        return True
    except Exception:
        return False


success_count = 0
fail_count = 0
skip_count = 0

for i, (pid, name) in enumerate(products):
    # Skip barcode IDs and freight
    if pid in skip_ids:
        skip_count += 1
        continue

    # Create filename: replace spaces with underscores
    filename = pid.replace(" ", "_") + ".jpg"
    filepath = os.path.join(IMAGES_DIR, filename)

    # Skip if already downloaded
    if os.path.exists(filepath) and os.path.getsize(filepath) > 1000:
        success_count += 1
        if (i + 1) % 10 == 0:
            print(f"[{i+1}/{len(products)}] Already exists: {filename}")
        continue

    # Clean up product name for search
    clean_name = name.strip().lstrip('*').strip()

    # Build search query - use product name with Korean context
    query = f"{clean_name} Korean kitchen"

    # Search for image
    img_url = get_image_url_from_bing(query)

    if img_url:
        ok = download_and_save_image(img_url, filepath)
        if ok:
            success_count += 1
        else:
            # Try second URL
            img_url2 = None
            search_url = f"https://www.bing.com/images/search?q={quote_plus(query)}&form=HDRSC2&first=1"
            try:
                resp = requests.get(search_url, headers=headers, timeout=15)
                murl_matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+)', resp.text)
                if len(murl_matches) > 1:
                    img_url2 = html.unescape(murl_matches[1])
            except:
                pass
            if img_url2:
                ok2 = download_and_save_image(img_url2, filepath)
                if ok2:
                    success_count += 1
                else:
                    fail_count += 1
            else:
                fail_count += 1
    else:
        fail_count += 1

    # Print progress every 10 items
    if (i + 1) % 10 == 0:
        print(f"[{i+1}/{len(products)}] Success: {success_count}, Failed: {fail_count}, Skipped: {skip_count}")

    # Small delay to avoid rate limiting
    time.sleep(1)

print(f"\n=== COMPLETE ===")
print(f"Total products: {len(products)}")
print(f"Successfully downloaded: {success_count}")
print(f"Failed: {fail_count}")
print(f"Skipped (barcode/freight): {skip_count}")
