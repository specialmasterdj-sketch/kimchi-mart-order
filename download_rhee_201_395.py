import requests, re, os, time, json
from PIL import Image
from io import BytesIO

save_dir = r'C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\images\rhee'
products_file = r'C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\products.js'

# Read products.js to find all rhee items
with open(products_file, encoding='utf-8') as f:
    content = f.read()

# Extract all rhee product entries
pattern = re.findall(r'\{ id: "([^"]+)", brand: "([^"]+)", name: "([^"]+)".*?image: "([^"]+)"', content)

# Filter to rhee items needing individual photos
need_download = []
for item_id, brand, name, image in pattern:
    if 'images/rhee/' not in image:
        continue
    img_file = f'{item_id}.jpg'
    img_path = os.path.join(save_dir, img_file)
    # Skip if already has individual photo > 5KB
    if os.path.exists(img_path) and os.path.getsize(img_path) > 5000:
        continue
    # Only include catalog page images (half_* or image*)
    if image.startswith('images/rhee/half_') or image.startswith('images/rhee/image'):
        need_download.append({'id': item_id, 'brand': brand, 'name': name, 'image': image})

print(f"Total items needing photos: {len(need_download)}")

# Items 201-395 (0-indexed: 200-394)
start_idx = 200
end_idx = 395
batch = need_download[start_idx:end_idx]
print(f"Processing items {start_idx+1}-{min(end_idx, len(need_download))}: {len(batch)} items")

def search_and_download(item_code, query):
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    url = f'https://www.bing.com/images/search?q={requests.utils.quote(query)}&first=1&count=5'
    try:
        r = requests.get(url, headers=headers, timeout=10)
        matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+?\.(?:jpg|jpeg|png))', r.text)
        for img_url in matches[:3]:
            try:
                img_r = requests.get(img_url, headers=headers, timeout=10)
                if img_r.status_code == 200 and len(img_r.content) > 5000:
                    img = Image.open(BytesIO(img_r.content))
                    img = img.convert('RGB')
                    ratio = min(300/img.width, 300/img.height)
                    if ratio < 1:
                        img = img.resize((int(img.width*ratio), int(img.height*ratio)))
                    filepath = os.path.join(save_dir, f'{item_code}.jpg')
                    img.save(filepath, 'JPEG', quality=85)
                    return True
            except:
                continue
    except:
        pass
    return False

successes = 0
failures = []

for i, item in enumerate(batch):
    idx = start_idx + i + 1
    # Clean up name for search query
    name_clean = item['name'].replace('(', '').replace(')', '').replace('_', ' ').replace('#', 'lb')
    query = f"{item['brand']} {name_clean} product"

    print(f"[{idx}/{end_idx}] {item['id']} - {item['brand']} {item['name']}...", end=' ', flush=True)

    if search_and_download(item['id'], query):
        successes += 1
        print("OK")
    else:
        # Try alternative query without brand
        if search_and_download(item['id'], f"{name_clean} korean food product"):
            successes += 1
            print("OK (alt)")
        else:
            failures.append(item['id'])
            print("FAIL")

    time.sleep(0.5)

print(f"\n=== RESULTS ===")
print(f"Successes: {successes}/{len(batch)}")
print(f"Failures: {len(failures)}")
if failures:
    print(f"Failed items: {', '.join(failures)}")

# Save results
with open(os.path.join(save_dir, '..', 'download_results_201_395.json'), 'w') as f:
    json.dump({'successes': successes, 'failures': failures, 'total': len(batch)}, f, indent=2)
