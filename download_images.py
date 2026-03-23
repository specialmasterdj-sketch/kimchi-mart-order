import sys
import io
import os
import re
import time
import requests
from PIL import Image
from io import BytesIO
from urllib.parse import quote_plus

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

def search_bing_image(query):
    """Search Bing Images and return first image URL"""
    search_url = f"https://www.bing.com/images/search?q={quote_plus(query)}&form=HDRSC2&first=1"
    try:
        resp = requests.get(search_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        html = resp.text

        # Try multiple patterns to find image URLs
        # Pattern 1: murl from metadata
        matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', html)
        if matches:
            for url in matches[:5]:
                if any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif']):
                    return url
            return matches[0]

        # Pattern 2: src attributes in img tags
        matches = re.findall(r'src="(https?://[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"', html)
        if matches:
            for url in matches:
                if 'bing.com' not in url and 'microsoft.com' not in url:
                    return url

        # Pattern 3: data-src
        matches = re.findall(r'data-src="(https?://[^"]+)"', html)
        if matches:
            for url in matches:
                if any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                    return url

        return None
    except Exception as e:
        return None


def download_and_save(url, save_path):
    """Download image, resize to max 300px wide, save as JPEG quality 70"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15, stream=True)
        resp.raise_for_status()

        content_type = resp.headers.get('content-type', '')
        if 'text/html' in content_type:
            return False

        img = Image.open(BytesIO(resp.content))

        # Convert to RGB if needed (for PNG with alpha, etc.)
        if img.mode in ('RGBA', 'P', 'LA'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Resize to max 300px wide
        if img.width > 300:
            ratio = 300 / img.width
            new_height = int(img.height * ratio)
            img = img.resize((300, new_height), Image.LANCZOS)

        img.save(save_path, 'JPEG', quality=70)
        return True
    except Exception as e:
        return False


def build_search_query(brand, name):
    """Build a search query from brand and product name"""
    # Clean up the name - remove size specs in parens like (bk, (rd, (wt
    clean_name = re.sub(r'\([a-z]{2,3}\s*$', '', name).strip()
    clean_name = re.sub(r'\(.*?\)', '', clean_name).strip()
    # Remove dimension patterns like 3.25"Dx4.25"H
    clean_name = re.sub(r'[\d.]+["\']?[DdXxHhLlWw]+\s*', '', clean_name).strip()
    # Remove extra whitespace
    clean_name = re.sub(r'\s+', ' ', clean_name).strip()

    if brand and brand != "EDEN" and brand != "KC TRADING":
        return f"{brand} {clean_name}"
    return f"{clean_name} Korean"


# ============ EDEN PRODUCTS ============
eden_products = [
    {"id": "NO.100", "brand": "EDEN", "name": "BATH TOWEL SALUX NYLON"},
    {"id": "ED-T2", "brand": "EDEN", "name": "CL FILTERBAG 50pc 95x115mm"},
    {"id": "39-209", "brand": "EDEN", "name": "RUBBER GLOVE L."},
    {"id": "ED-RG04", "brand": "EDEN", "name": "RUBBER GLOVE L. mamison"},
    {"id": "ED-RG03", "brand": "EDEN", "name": "RUBBER GLOVE M. mamison"},
    {"id": "ED-RG02", "brand": "EDEN", "name": "RUBBER GLOVE S. mamison"},
    {"id": "VB-SC100", "brand": "EDEN", "name": "VIA BATH TOWEL"},
    {"id": "305601", "brand": "EDEN", "name": "WIRE BRUSH S/S 30g 3pc"},
    {"id": "AS236-TQ", "brand": "EDEN", "name": "2.75 SQ DISH"},
    {"id": "PC37-1", "brand": "EDEN", "name": "3.25D MUG W/LID & SPOON"},
    {"id": "PC34-1", "brand": "EDEN", "name": "3.25D x 5H MUG W/LID & SPOON"},
    {"id": "PC17-1", "brand": "EDEN", "name": "3.25Dx4.25H MUG w/lid & spoon cat"},
    {"id": "PC17-2", "brand": "EDEN", "name": "3.25Dx4.25H MUG w/lid & spoon cat"},
    {"id": "PC14-2", "brand": "EDEN", "name": "3.25Dx4.5H MUG w/ lid & spoon bear"},
    {"id": "TC1-B", "brand": "EDEN", "name": "3.25H TEACUP 7.5oz"},
    {"id": "TC1-W", "brand": "EDEN", "name": "3.25H TEACUP 7.5oz"},
    {"id": "CY6/BP", "brand": "EDEN", "name": "3.75x2.25H LACQ.BOWL for kids"},
    {"id": "CY6/PB", "brand": "EDEN", "name": "3.75x2.25H LACQ.BOWL for kids"},
    {"id": "NS2-D", "brand": "EDEN", "name": "3Dx3.25H MUG w/spoon 14 fl.oz"},
    {"id": "WO-05", "brand": "EDEN", "name": "4-1/2Dx2-1/2H BOWL LQ RD"},
    {"id": "Y55/BC", "brand": "EDEN", "name": "4-1/2Dx2-1/2H BOWL LQ RD"},
    {"id": "Y55/BP", "brand": "EDEN", "name": "4-1/2Dx2-1/2H BOWL LQ RD"},
    {"id": "WO-06", "brand": "EDEN", "name": "4-1/2Dx2-1/2H BOWL LQ RD"},
    {"id": "N55/B", "brand": "EDEN", "name": "4-5/8D BOWL LQ RD"},
    {"id": "SY54-SB", "brand": "EDEN", "name": "4.25Dx1.5H BOWL"},
    {"id": "HR25/BP", "brand": "EDEN", "name": "4.25Dx2H RICE BOWL panda"},
    {"id": "HR25/GP", "brand": "EDEN", "name": "4.25Dx2H RICE BOWL panda"},
    {"id": "MT54-HS", "brand": "EDEN", "name": "4.5D x 2.5H BOWL"},
    {"id": "PT546-YM", "brand": "EDEN", "name": "4.75Dx2.5H BOWL"},
    {"id": "SY553-SB", "brand": "EDEN", "name": "5.5Dx2H BOWL"},
    {"id": "HB56-LMB", "brand": "EDEN", "name": "5.75Dx2.5H BOWL"},
    {"id": "AS26-TQ", "brand": "EDEN", "name": "5.75L SPOON"},
    {"id": "SBP1-W", "brand": "EDEN", "name": "5D BOWL W/Chops"},
    {"id": "FDKG-12", "brand": "EDEN", "name": "5Dx1.75H BOWL"},
    {"id": "FDKG-11", "brand": "EDEN", "name": "5Dx3H BOWL"},
    {"id": "SBF1-B", "brand": "EDEN", "name": "5Dx4H BOWL w/CHOPSTICKS OWL"},
    {"id": "CH174-S", "brand": "EDEN", "name": "5PR CHOPSTICK SET BB"},
    {"id": "CH177-S", "brand": "EDEN", "name": "5PR CHOPSTICK SET BB"},
    {"id": "MT55-HS", "brand": "EDEN", "name": "6.25D x 3.25H BOWL"},
    {"id": "SY56-SB", "brand": "EDEN", "name": "6.25Dx2.75H BOWL"},
    {"id": "MT56-HS", "brand": "EDEN", "name": "6D x 2.75H BOWL"},
    {"id": "KY56/79", "brand": "EDEN", "name": "6Dx2-3/4H KIDS BOWL"},
    {"id": "6028/BR", "brand": "EDEN", "name": "7-3/4D BOWL"},
    {"id": "SY58-SB", "brand": "EDEN", "name": "8Dx3H BOWL"},
    {"id": "DIP09", "brand": "EDEN", "name": "BASKET PL. 280x205mm SQ."},
    {"id": "DIP10", "brand": "EDEN", "name": "BASKET PL. 315x235mm SQ."},
    {"id": "DIP11", "brand": "EDEN", "name": "BASKET PL. 350x260mm SQ."},
    {"id": "DIP08", "brand": "EDEN", "name": "BASKET PL. MINI SQ."},
    {"id": "10/BR", "brand": "EDEN", "name": "BOAT PLATE"},
    {"id": "122371", "brand": "EDEN", "name": "CANISTER for Dry Food PL"},
    {"id": "122364", "brand": "EDEN", "name": "CANISTER for Dry Food PL"},
    {"id": "CH504-S", "brand": "EDEN", "name": "CHOPSTICK 1PR W/REST Cat"},
    {"id": "CH48", "brand": "EDEN", "name": "CHOPSTICK 2PR W/REST"},
    {"id": "CH165-S", "brand": "EDEN", "name": "CHOPSTICK 5PR sakura"},
    {"id": "CHSK100", "brand": "EDEN", "name": "CHOPSTICK SET 3PR for CHILDREN"},
    {"id": "KS1/B", "brand": "EDEN", "name": "CHOPSTICK W/CASE"},
    {"id": "KS1/R", "brand": "EDEN", "name": "CHOPSTICK W/CASE"},
    {"id": "EDC-JE023", "brand": "EDEN", "name": "CHOPSTICKS Vacu. SS304 23cmL 5prs"},
    {"id": "HSP32", "brand": "EDEN", "name": "CONDIMENT BOWL NO.1"},
    {"id": "164180", "brand": "EDEN", "name": "CONTAINER PL 3pc"},
    {"id": "SI-08", "brand": "EDEN", "name": "Doogy Kids Spoon with Cow S/S"},
    {"id": "305738", "brand": "EDEN", "name": "EDISON CHOPSTICK ADULTS new for right hand"},
    {"id": "12E0801", "brand": "EDEN", "name": "EDISON CHOPSTICK Amber righthanded 7"},
    {"id": "10E1716", "brand": "EDEN", "name": "EDISON CHOPSTICK Crong righthanded 7"},
    {"id": "EF7046", "brand": "EDEN", "name": "EDISON CHOPSTICK Friends LION Step 1"},
    {"id": "EF7060", "brand": "EDEN", "name": "EDISON CHOPSTICK Friends OWL Step 1"},
    {"id": "EF7053", "brand": "EDEN", "name": "EDISON CHOPSTICK RABBIT Step 1"},
    {"id": "RP517-N", "brand": "EDEN", "name": "GL LOCK CONTAINER GL RC 1900ML"},
    {"id": "RP-521-N", "brand": "EDEN", "name": "GL LOCK CONTAINER GL RC 715ML"},
    {"id": "503064", "brand": "EDEN", "name": "ICE TRAY w/CAP NO.12"},
    {"id": "503163", "brand": "EDEN", "name": "ICE TRAY w/CAP NO.8"},
    {"id": "LS50", "brand": "EDEN", "name": "JOYLIFE S/S TURNER 12"},
    {"id": "EDC-SK20", "brand": "EDEN", "name": "KETTLE W/Strainer S.S. 2.0L"},
    {"id": "EDC-SK30", "brand": "EDEN", "name": "KETTLE W/Strainer S.S. 3.0L"},
    {"id": "022169", "brand": "EDEN", "name": "MESH BOWL PL. 6.6X3.5H"},
    {"id": "SH578-1", "brand": "EDEN", "name": "NOODLE BOWL 8.5Dx3.5H"},
    {"id": "SH8-1", "brand": "EDEN", "name": "SAKE CUP 2.25H"},
    {"id": "JX8-1", "brand": "EDEN", "name": "SAKE CUP 2Dx1.5H 2 fl. oz"},
    {"id": "JX8-3", "brand": "EDEN", "name": "SAKE CUP 2Dx1.5H 2 fl. oz"},
    {"id": "A2711-WH", "brand": "EDEN", "name": "SAUCE DISH 3 flower"},
    {"id": "333/BR", "brand": "EDEN", "name": "SAUCE DISH w/2 DIVIDER"},
    {"id": "031/R", "brand": "EDEN", "name": "SERVING SPOON 8-1/2"},
    {"id": "026/M", "brand": "EDEN", "name": "SOUP SPOON PL 5-1/2L"},
    {"id": "026/BR", "brand": "EDEN", "name": "SOUP SPOON PL 5-1/2L"},
    {"id": "239591", "brand": "EDEN", "name": "SPONGE FOR DISH"},
    {"id": "SI-01", "brand": "EDEN", "name": "SPOON & CHOPSTICK set"},
    {"id": "062/BR", "brand": "EDEN", "name": "SPOON PL."},
    {"id": "062/M", "brand": "EDEN", "name": "SPOON PL."},
    {"id": "A0234", "brand": "EDEN", "name": "SPOON porcelain 5.25L"},
    {"id": "A5217", "brand": "EDEN", "name": "SPOON porcelain 5.75L White"},
    {"id": "239589", "brand": "EDEN", "name": "STEAMER S/S MD"},
    {"id": "KB8715/60", "brand": "EDEN", "name": "STRAINER 5-1/2D"},
    {"id": "EDC-Y50214", "brand": "EDEN", "name": "STRAINER for noodle S/S 14cmD"},
    {"id": "EDC-PS16", "brand": "EDEN", "name": "STRAINER w/handle S/S 16cmD"},
    {"id": "EDC-Y21", "brand": "EDEN", "name": "STRAINER w/handle S/S 21cm"},
    {"id": "EDC-PS22", "brand": "EDEN", "name": "STRAINER w/handle S/S 22cmD"},
    {"id": "TCC28", "brand": "EDEN", "name": "TEA CUP 2.75Dx4.25H rabbit"},
    {"id": "EDC-TW34", "brand": "EDEN", "name": "WOK C-Steel w/2-wd handle 34cmD"},
    {"id": "EDC-TW38", "brand": "EDEN", "name": "WOK C-Steel w/2-wd handle 38cmD"},
    {"id": "ED-KCW26", "brand": "EDEN", "name": "WOK PAN CAST 10"},
    {"id": "EDC-FL250", "brand": "EDEN", "name": "OIL JAR GL Air-Tight M 250ml"},
    {"id": "A1889", "brand": "EDEN", "name": "SAKE BOTTLE 5.5H"},
    {"id": "A1830", "brand": "EDEN", "name": "SAKE BOTTLE 7H"},
    {"id": "120261", "brand": "EDEN", "name": "SAUCE DISPENSER PL 6-1/2H"},
    {"id": "SR300", "brand": "EDEN", "name": "COOKING KNIFE DEBA S/S 11"},
    {"id": "SR900", "brand": "EDEN", "name": "COOKING KNIFE S/S"},
    {"id": "SR200", "brand": "EDEN", "name": "COOKING KNIFE S/S 12"},
    {"id": "SR100", "brand": "EDEN", "name": "COOKING KNIFE S/S 7"},
    {"id": "139566", "brand": "EDEN", "name": "EGG CUTTER 12"},
    {"id": "ED-KS01", "brand": "EDEN", "name": "KITCHEN SCISSOR 26cm"},
    {"id": "09-056", "brand": "EDEN", "name": "NOSE SCISSOR S/S"},
    {"id": "A-15", "brand": "EDEN", "name": "PEELER Y-TYPE PL 4-1/4L"},
    {"id": "VS-101/EDEN", "brand": "EDEN", "name": "VEGETABLE SLICER 13Lx4-1/2"},
    {"id": "121929", "brand": "EDEN", "name": "VEGETABLE SLICER 9x3.1"},
    {"id": "BM-2", "brand": "EDEN", "name": "BATH MITT 2pc"},
    {"id": "054719", "brand": "EDEN", "name": "CL AIR FRYER PAPER FOIL 16cm 30pc"},
    {"id": "054726", "brand": "EDEN", "name": "CL AIR FRYER PAPER FOIL 23cm 30pc"},
    {"id": "210986", "brand": "EDEN", "name": "DIPPER PL White 5Dx6H"},
    {"id": "CD7-1", "brand": "EDEN", "name": "DONABE ceramic 8-1/2DX3.25H"},
    {"id": "DRC-175", "brand": "EDEN", "name": "DONABE CERM #5 17.5cmD"},
    {"id": "DRC-160", "brand": "EDEN", "name": "DONABE CERM 16cmD"},
    {"id": "EDC-SN30", "brand": "EDEN", "name": "DRAINER NET S/S 11cmD"},
    {"id": "EDC-SN50", "brand": "EDEN", "name": "DRAINER NET S/S 5cmD"},
    {"id": "EDC-SN40", "brand": "EDEN", "name": "DRAINER NET S/S 7cmD"},
    {"id": "LS49", "brand": "EDEN", "name": "JOYLIFE S/S BUTTER BEATER 11-1/2"},
    {"id": "ED-KC002", "brand": "EDEN", "name": "KITCHEN CLEANER"},
    {"id": "KO319514", "brand": "KOSE", "name": "SOFTYMO CLEANSING GEL HYALURONIC ACID 210g"},
    {"id": "KR674418", "brand": "KRACIE", "name": "NAIVE FACE WASH FOAM PEACH LEAF 130G"},
    {"id": "KR674579", "brand": "KRACIE", "name": "NAIVE FACE WASH YUZU CERAMIDE 130g"},
    {"id": "KR607492", "brand": "KRACIE", "name": "NAIVE MAKEUP REMOVAL YUZU CERAMIDE 200g"},
    {"id": "442528", "brand": "EDEN", "name": "LAUNDRY FINE NET 54Lx42Dcm"},
    {"id": "YT4", "brand": "EDEN", "name": "MELAMIN BASE 150MM"},
    {"id": "NR468638", "brand": "NATURE REPUBLIC", "name": "ARGAN ESSENTIAL DEEP CARE HAIR ESSENCE 80ml"},
    {"id": "NR468652", "brand": "NATURE REPUBLIC", "name": "ARGAN ESSENTIAL MOIST HAIR MIST"},
    {"id": "NR423552", "brand": "NATURE REPUBLIC", "name": "BAMBOO CHARCOAL MUD PACK"},
    {"id": "NR443109", "brand": "NATURE REPUBLIC", "name": "CELL POWER EMULSION"},
    {"id": "NR457267", "brand": "NATURE REPUBLIC", "name": "CREAM Mild Green Tea 155ml"},
    {"id": "NR424450", "brand": "NATURE REPUBLIC", "name": "FOOT MASK Aloe Vera Moisture"},
    {"id": "NR462230", "brand": "NATURE REPUBLIC", "name": "GOOD SKIN AMPOULE CERAMIDE"},
    {"id": "NR463992", "brand": "NATURE REPUBLIC", "name": "GOOD SKIN AMPOULE CREAM Peptide 50ml"},
    {"id": "NR487899", "brand": "NATURE REPUBLIC", "name": "HAIR & NATURE POWER HOLDING HAIR GEL"},
    {"id": "NR476855", "brand": "NATURE REPUBLIC", "name": "HONEY MELTING LIP 01 APRICOT"},
    {"id": "NR491162", "brand": "NATURE REPUBLIC", "name": "HONEY MELTING LIP 14 MAPLE GLITTER"},
    {"id": "NR489473", "brand": "NATURE REPUBLIC", "name": "LIP STUDIO INTENSE SATIN LIPSTICK 13 MAUVE BOSS"},
    {"id": "NR490097", "brand": "NATURE REPUBLIC", "name": "MILD & MOISTURE ALOE VERA FOAM CLEANSER"},
    {"id": "NR488148", "brand": "NATURE REPUBLIC", "name": "MILD & MOISTURE ALOE VERA WATERY GEL"},
    {"id": "NR474578", "brand": "NATURE REPUBLIC", "name": "NATURAL MADE BLACK CHARCOAL PORE TONER PAD"},
    {"id": "NR471096", "brand": "NATURE REPUBLIC", "name": "PEELING GEL Natural Made Lemongrass"},
    {"id": "NR482986", "brand": "NATURE REPUBLIC", "name": "SOOTHING & MOISTURE ALOE VERA CLEANSING GEL CREAM"},
    {"id": "NR457243", "brand": "NATURE REPUBLIC", "name": "TONER Mild Green Tea 155ml"},
    {"id": "EDC-SN20", "brand": "EDEN", "name": "PUNCHING SINK NET S/S 113Dx41mmH"},
    {"id": "TSS1-743", "brand": "EDEN", "name": "SAKE SET 1:4"},
    {"id": "090011", "brand": "EDEN", "name": "SHOWER CAP PL"},
    {"id": "177261", "brand": "EDEN", "name": "SIMPLE LIFE MASHER MET"},
    {"id": "802746", "brand": "EDEN", "name": "SUSHI MOLD PL Large"},
    {"id": "EDCWK100E", "brand": "EDEN", "name": "TEA WHISK BAM 4H bamboo"},
    {"id": "067023", "brand": "EDEN", "name": "Bamboo Sushi Mat 9.4Lx8.3W"},
    {"id": "067016", "brand": "EDEN", "name": "Bamboo Sushi Mat w/o Skin"},
    {"id": "009112", "brand": "EDEN", "name": "SUSHI MAT 27x27cm"},
]

# ============ KC TRADING PRODUCTS ============
kc_products = [
    {"id": "AC0128", "brand": "KC TRADING", "name": "스토마신 (100)"},
    {"id": "AG1010", "brand": "VERACLARA", "name": "MASK SHEET BLACK CAVIAR"},
    {"id": "AG1012", "brand": "VERACLARA", "name": "MASK SHEET CERAMIDE"},
    {"id": "AG1013", "brand": "VERACLARA", "name": "MASK SHEET GOLD BIRD NEST"},
    {"id": "AG1014", "brand": "VERACLARA", "name": "MASK SHEET GOLD PEPTIDE"},
    {"id": "AG1015-A", "brand": "VERACLARA", "name": "MASK SHEET CARROT"},
    {"id": "AG1015-B", "brand": "VERACLARA", "name": "MASK SHEET CICA"},
    {"id": "AG1015-C", "brand": "VERACLARA", "name": "MASK SHEET HYALURONIC ACID"},
    {"id": "AG1015-D", "brand": "VERACLARA", "name": "MASK SHEET RED PROPOLIS"},
    {"id": "AH1401", "brand": "KC TRADING", "name": "99% ALOE SOOTHING GEL"},
    {"id": "BAKN103", "brand": "KC TRADING", "name": "레모나 Lemona vitamin C"},
    {"id": "BSR6F72", "brand": "BIGEN", "name": "SPEEDY REFILL #6 hair dye"},
    {"id": "BSR7F72", "brand": "BIGEN", "name": "SPEEDY REFILL #7 hair dye"},
    {"id": "BSR8F72", "brand": "BIGEN", "name": "SPEEDY REFILL #8 hair dye"},
    {"id": "DSSH", "brand": "DONGSUNG", "name": "쌍화원 Korean herbal drink"},
    {"id": "DSSK", "brand": "DONGSUNG", "name": "쌍기원 Korean cough remedy"},
    {"id": "DSST", "brand": "DONGSUNG", "name": "실키 치약 silky toothpaste"},
    {"id": "FB1018-A", "brand": "KC TRADING", "name": "세원 망사 수세미 mesh scrubber 3PCS"},
    {"id": "FC1001", "brand": "KC TRADING", "name": "가든 리프 공기 rice bowl 4 inch"},
    {"id": "FC1018", "brand": "KC TRADING", "name": "가든 리프 머그 garden leaf mug"},
    {"id": "FC4201", "brand": "KC TRADING", "name": "쁘띠 멜라민 원형종지 melamine sauce dish 6CM"},
    {"id": "FC4202", "brand": "KC TRADING", "name": "쁘띠 멜라민 원형종지 melamine sauce dish 6.5CM"},
    {"id": "FC4210", "brand": "KC TRADING", "name": "쁘띠 멜라민 손잡이 종지 melamine sauce dish handle"},
    {"id": "FC4215", "brand": "KC TRADING", "name": "쁘띠 멜라민 원형 종지 2절 melamine 2 section dish"},
    {"id": "FC4221", "brand": "KC TRADING", "name": "쁘띠 멜라민 사각 종지 2절 melamine square dish"},
    {"id": "FC5001", "brand": "KC TRADING", "name": "도자기 카이젠 공기 ceramic rice bowl 3.75"},
    {"id": "FC5002", "brand": "KC TRADING", "name": "도자기 카이젠 공기 ceramic rice bowl 4.75"},
    {"id": "FC5003", "brand": "KC TRADING", "name": "도자기 카이젠 공기 ceramic rice bowl 6.0"},
    {"id": "FC5010", "brand": "KC TRADING", "name": "도자기 카이젠 찬기 ceramic side dish 3.25"},
    {"id": "FC5084", "brand": "KC TRADING", "name": "도자기 화이트 티스푼 ceramic white teaspoon 4PCS"},
    {"id": "FK2011", "brand": "ELASTINE", "name": "퓨어브리즈 퍼퓸 린스 conditioner 600ML"},
    {"id": "FK2012", "brand": "ELASTINE", "name": "러브미 퍼퓸 샴푸 shampoo 600ML"},
    {"id": "FK2013", "brand": "ELASTINE", "name": "러브미 퍼퓸 린스 conditioner 600ML"},
    {"id": "FK2030-A", "brand": "REEN", "name": "흑모비책 hair dye cream wine brown 120G"},
    {"id": "FK2031", "brand": "REEN", "name": "흑모비책 hair dye cream black 120G"},
    {"id": "FK2032", "brand": "REEN", "name": "흑모비책 hair dye cream dark brown 120G"},
    {"id": "FK2033", "brand": "REEN", "name": "흑모비책 hair dye cream deep brown 120G"},
    {"id": "FK2034", "brand": "REEN", "name": "흑모비책 hair dye cream light brown 120G"},
    {"id": "FK2035", "brand": "REEN", "name": "흑모비책 hair dye cream natural brown 120G"},
    {"id": "FK2074", "brand": "ON THE BODY", "name": "퍼퓸 바디로션 perfume body lotion happy breeze 400ML"},
    {"id": "FP1005", "brand": "KC TRADING", "name": "실리콘 김밥말이 silicone kimbap roller"},
    {"id": "FP1206", "brand": "KC TRADING", "name": "깔대기 funnel small"},
    {"id": "FP1210", "brand": "KC TRADING", "name": "슬라이드 채반 slide strainer"},
    {"id": "FP1214", "brand": "KC TRADING", "name": "만능 파칼 green onion cutter"},
    {"id": "FP1296-A", "brand": "KC TRADING", "name": "계량컵 measuring cup 1000ML"},
    {"id": "FP1370", "brand": "KC TRADING", "name": "점보 분무기 jumbo spray bottle 1050ML"},
    {"id": "FP1408", "brand": "FELIZ", "name": "분무기 spray bottle 300ML"},
    {"id": "FP1526", "brand": "KC TRADING", "name": "P/P 다라이 재래식 원형 plastic basin XL"},
    {"id": "FP2025", "brand": "KC TRADING", "name": "앞머리 롱 헤어롤 hair roller large 42MM"},
    {"id": "FP2026", "brand": "KC TRADING", "name": "앞머리 롱 헤어롤 hair roller medium 32MM"},
    {"id": "FP2031", "brand": "KC TRADING", "name": "고양이 밥주걱 cat rice paddle"},
    {"id": "FP2391", "brand": "KC TRADING", "name": "브니엘야채볼 대 vegetable bowl large"},
    {"id": "FP2392", "brand": "KC TRADING", "name": "브니엘야채볼 중 vegetable bowl medium"},
    {"id": "FP2393", "brand": "KC TRADING", "name": "브니엘야채볼 소 vegetable bowl small"},
    {"id": "FP2639", "brand": "KC TRADING", "name": "싹싹솔 bottle brush"},
    {"id": "FQ1084", "brand": "KC TRADING", "name": "손잡이 소주잔 세트 soju glass set handle 2PCS"},
    {"id": "FQ1162-B", "brand": "MUGUNGHWA", "name": "알로에 비누 aloe soap 100g"},
    {"id": "FQ1250", "brand": "KC TRADING", "name": "뉴 P 식도 kitchen knife"},
    {"id": "FQ1299", "brand": "KC TRADING", "name": "홍삼대보 red ginseng drink 10 bottles 75ML"},
    {"id": "FQ1375", "brand": "KC TRADING", "name": "전기 주전자 유럽식 electric kettle European 1.7L"},
    {"id": "FQ1377-A", "brand": "KC TRADING", "name": "전기 주전자 유리 electric kettle glass 1.7L"},
    {"id": "FQ1582", "brand": "KC TRADING", "name": "때비누 exfoliating soap 삼백초 150g"},
    {"id": "FQ1583", "brand": "KC TRADING", "name": "때비누 exfoliating soap lavender 150g"},
    {"id": "FQ1588", "brand": "KC TRADING", "name": "때비누 exfoliating soap red ginseng 150g"},
    {"id": "FQ1589", "brand": "KC TRADING", "name": "때비누 exfoliating soap rose 150g"},
    {"id": "FQ1643", "brand": "KC TRADING", "name": "K-손톱깎이 nail clipper large"},
    {"id": "FQ1644", "brand": "KC TRADING", "name": "K-손톱깎이 nail clipper medium"},
    {"id": "FQ1664", "brand": "KC TRADING", "name": "러블리 곱창 헤어밴드 hair band"},
    {"id": "FS0002", "brand": "KC TRADING", "name": "스텐 스폰지 병솔 stainless bottle brush large"},
    {"id": "FS0016", "brand": "GGOMI", "name": "데바칼 대 deba knife large 34CM"},
    {"id": "FS0017", "brand": "GGOMI", "name": "데바칼 소 deba knife small 29CM"},
    {"id": "FS0019", "brand": "GGOMI", "name": "지갑 회 칼 sashimi knife"},
    {"id": "FS0025", "brand": "GGOMI", "name": "고급 사각 식도 premium square kitchen knife"},
    {"id": "FS0026", "brand": "KC TRADING", "name": "다용도 사각 식도 multi-purpose square knife"},
    {"id": "FS1055", "brand": "KC TRADING", "name": "뉴로즈 집과도 paring knife"},
    {"id": "FS1089", "brand": "KC TRADING", "name": "스텐 타공 샐러드 집게 대 stainless salad tong large 28CM"},
    {"id": "FS1090", "brand": "KC TRADING", "name": "스텐 타공 샐러드 집게 중 stainless salad tong medium 23CM"},
    {"id": "FS1091", "brand": "KC TRADING", "name": "스텐 타공 샐러드 집게 소 stainless salad tong small 13CM"},
    {"id": "FS1094", "brand": "KC TRADING", "name": "악어집게 alligator tong extra large 40CM"},
    {"id": "FS1095", "brand": "KC TRADING", "name": "악어집게 alligator tong large 30CM"},
    {"id": "FS1096", "brand": "KC TRADING", "name": "악어집게 alligator tong medium 25CM"},
    {"id": "FS1125", "brand": "KAIZEN", "name": "다용도 집게 multi-purpose tong extra large 25.5CM"},
    {"id": "FS1135", "brand": "KAIZEN", "name": "스테이크 집게 steak tong extra large"},
    {"id": "FS1159", "brand": "KC TRADING", "name": "삼덕 접는과도 folding paring knife"},
    {"id": "FS1245", "brand": "KC TRADING", "name": "알루미늄 찜기 aluminum steamer 16CM"},
    {"id": "FS1246", "brand": "KC TRADING", "name": "알루미늄 찜기 aluminum steamer 18CM"},
    {"id": "FS1247", "brand": "KC TRADING", "name": "알루미늄 찜기 aluminum steamer 20CM"},
    {"id": "FS1257", "brand": "KC TRADING", "name": "알루미늄 직사각 쟁반 소 aluminum rectangular tray small"},
    {"id": "FS1258", "brand": "KC TRADING", "name": "알루미늄 직사각 쟁반 중 aluminum rectangular tray medium"},
    {"id": "FS1259", "brand": "KC TRADING", "name": "알루미늄 직사각 쟁반 대 aluminum rectangular tray large"},
    {"id": "L0008", "brand": "KC TRADING", "name": "김발 속대 bamboo sushi rolling mat inner"},
    {"id": "L0009", "brand": "KC TRADING", "name": "김발 겉대 bamboo sushi rolling mat outer"},
    {"id": "L0019-A", "brand": "KC TRADING", "name": "삼정 철수세미 3PCS steel wool scrubber 20G"},
    {"id": "L0019-B", "brand": "KC TRADING", "name": "삼정 철수세미 2PCS steel wool scrubber 30G"},
    {"id": "L0029", "brand": "KC TRADING", "name": "반짝이 수세미 5P glitter scrubber"},
    {"id": "L0031", "brand": "KC TRADING", "name": "깔깔이 수세미 5P rough scrubber"},
    {"id": "L0062", "brand": "KC TRADING", "name": "GLASS 미니 양념통 mini glass jar handle 120ML"},
    {"id": "L0062-A", "brand": "KC TRADING", "name": "GLASS MINI JAR 200ML large"},
    {"id": "L0079-B", "brand": "KC TRADING", "name": "식초 기름병 vinegar oil bottle 250ML"},
    {"id": "L0080", "brand": "KC TRADING", "name": "SYRUP DISPENSER 220ML"},
    {"id": "L0081-B", "brand": "KC TRADING", "name": "간장병 soy sauce bottle small"},
    {"id": "L0162", "brand": "KC TRADING", "name": "P/L 사각 비누각 plastic square soap dish"},
    {"id": "L0209", "brand": "KC TRADING", "name": "CUTTER KNIFE 6PCS"},
    {"id": "L0284-A", "brand": "KC TRADING", "name": "대나무 수저받침세트 bamboo chopstick rest maple A"},
    {"id": "L0284-B", "brand": "KC TRADING", "name": "대나무 수저받침세트 bamboo chopstick rest maple B"},
    {"id": "L0309", "brand": "KC TRADING", "name": "옻칠 나무 수저 세트 lacquer wood spoon chopstick set 23CM"},
    {"id": "L0312-B", "brand": "KC TRADING", "name": "옻칠 2P 나무 스푼 lacquer wood spoon 23CM"},
    {"id": "L0312-D", "brand": "KC TRADING", "name": "옻칠 6P 나무 스푼 lacquer wood spoon set 23CM"},
    {"id": "L0315", "brand": "KC TRADING", "name": "옻칠 나무 롱 티스푼 lacquer wood long teaspoon 19.5CM"},
    {"id": "L0409", "brand": "KC TRADING", "name": "2 IN 1 오일병 spray oil bottle 16OZ"},
    {"id": "L0533", "brand": "KC TRADING", "name": "실리콘 주방 싱크 받침대 silicone kitchen sink mat"},
    {"id": "L0534", "brand": "KC TRADING", "name": "실리콘 목욕비누 받침대 silicone bath soap holder"},
    {"id": "L0555", "brand": "KC TRADING", "name": "스텐 진공 튀김젓가락 stainless frying chopsticks 33CM"},
    {"id": "L0569-C", "brand": "KC TRADING", "name": "원형 면 찜기 시트 round cotton steamer liner 28CM"},
    {"id": "L0670", "brand": "KC TRADING", "name": "계량표기 투명 오일병 clear oil bottle measuring 520ML"},
    {"id": "L0810", "brand": "KC TRADING", "name": "학습용 젓가락 고양이 training chopsticks cat"},
    {"id": "L0811", "brand": "KC TRADING", "name": "어린이 학습 젓가락 윙크 토끼 kids training chopsticks rabbit"},
    {"id": "L0812", "brand": "KC TRADING", "name": "어린이 학습 젓가락 아기 몽키 kids training chopsticks monkey"},
    {"id": "L0813", "brand": "KC TRADING", "name": "어린이 학습 젓가락 빨강 호랑이 kids training chopsticks tiger"},
    {"id": "L0817", "brand": "KC TRADING", "name": "어린이 학습 젓가락 아기 꿀돼지 kids training chopsticks pig"},
    {"id": "L0860", "brand": "KAIZEN", "name": "내열유리 계량컵 heat resistant glass measuring cup 500ML"},
    {"id": "L0960", "brand": "KC TRADING", "name": "스텐 미니 강판 stainless mini grater"},
    {"id": "L0966", "brand": "KC TRADING", "name": "스텐 채칼 stainless vegetable peeler"},
    {"id": "L0967", "brand": "KC TRADING", "name": "스텐 야채칼 stainless vegetable knife"},
    {"id": "L0968", "brand": "KC TRADING", "name": "스텐 양배추칼 대형 stainless cabbage knife large"},
    {"id": "L1010", "brand": "KAIZEN", "name": "럭셔리 갈비 가위 luxury rib scissors"},
    {"id": "L1013", "brand": "KC TRADING", "name": "다용도 가위 multi-purpose scissors"},
    {"id": "L1015", "brand": "KC TRADING", "name": "타이타늄 분리형 주방가위 titanium kitchen scissors detachable"},
    {"id": "L1016", "brand": "KC TRADING", "name": "올스텐 분리형 가위 all stainless detachable scissors"},
    {"id": "L1047", "brand": "KC TRADING", "name": "파스텔 자루바가지 소 pastel ladle small"},
    {"id": "L1061", "brand": "KC TRADING", "name": "세라믹 찬기 고양이 ceramic side dish cat 7.5CM"},
    {"id": "L1062", "brand": "KC TRADING", "name": "세라믹 찬기 고양이 ceramic side dish cat 10CM"},
    {"id": "L1071", "brand": "KC TRADING", "name": "S/S 원형찬기 특대 stainless round side dish XL 11.5CM"},
    {"id": "L1072", "brand": "KC TRADING", "name": "S/S 원형찬기 대 stainless round side dish large 10.5CM"},
    {"id": "L1073", "brand": "KC TRADING", "name": "S/S 원형찬기 중 stainless round side dish medium 8.5CM"},
    {"id": "L1074", "brand": "KC TRADING", "name": "S/S 원형찬기 소 stainless round side dish small 7.5CM"},
    {"id": "L1137", "brand": "KC TRADING", "name": "멀티 종합 오프너 multi opener"},
    {"id": "L1151", "brand": "KC TRADING", "name": "화이트 멜라민 종지 1절 white melamine sauce dish"},
    {"id": "L1152", "brand": "KC TRADING", "name": "화이트 멜라민 종지 2절 white melamine 2 section dish"},
    {"id": "L1221", "brand": "KC TRADING", "name": "면봉 원형 나무 cotton swabs round wood"},
    {"id": "L1621", "brand": "KC TRADING", "name": "고급 탄화 대나무 젓가락 10PCS bamboo chopsticks plain"},
    {"id": "L1622", "brand": "KC TRADING", "name": "고급 탄화 대나무 젓가락 10PCS bamboo chopsticks goldfish"},
    {"id": "L1623", "brand": "KC TRADING", "name": "고급 탄화 대나무 젓가락 10PCS bamboo chopsticks lucky bag"},
    {"id": "L1901", "brand": "KC TRADING", "name": "스텐 건지기 타공 stainless strainer skimmer 12CM"},
    {"id": "L1903", "brand": "KC TRADING", "name": "스텐 건지기 타공 stainless strainer skimmer 16CM"},
    {"id": "L1905", "brand": "KC TRADING", "name": "스텐 건지기 타공 stainless strainer skimmer 20CM"},
    {"id": "L1995", "brand": "KC TRADING", "name": "다솜 샤워타올 shower towel exfoliating"},
    {"id": "L1997", "brand": "KAIZEN", "name": "남성용 샤워타올 mens shower towel exfoliating"},
    {"id": "L2003", "brand": "KC TRADING", "name": "노벨 샤워 타올 novel shower towel exfoliating Korean"},
    {"id": "L2026", "brand": "KC TRADING", "name": "젓가락 42CM long cooking chopsticks"},
    {"id": "L2051", "brand": "KC TRADING", "name": "스폰지 수세미 퀸스크리너 4P sponge scrubber queens cleaner"},
    {"id": "L2052-C", "brand": "KC TRADING", "name": "대나무 젓가락 미녀도 5PCS bamboo chopsticks beauty"},
    {"id": "L2052-D", "brand": "KC TRADING", "name": "대나무 젓가락 전나무 5PCS bamboo chopsticks fir tree"},
    {"id": "L2052-F", "brand": "KC TRADING", "name": "대나무 젓가락 상감 5PCS bamboo chopsticks inlay"},
    {"id": "L2052-J", "brand": "KC TRADING", "name": "대나무 젓가락 사각 5PCS bamboo chopsticks square"},
    {"id": "L2052-K", "brand": "KC TRADING", "name": "대나무 젓가락 부엉이 5PCS bamboo chopsticks owl"},
    {"id": "L2053-B", "brand": "KC TRADING", "name": "대나무 젓가락 나비 5PCS bamboo chopsticks butterfly"},
    {"id": "L2053-C", "brand": "KC TRADING", "name": "대나무 젓가락 고양이 5PCS bamboo chopsticks cat"},
    {"id": "L2053-F", "brand": "KC TRADING", "name": "대나무 젓가락 검은 라인 bamboo chopsticks black line"},
    {"id": "L2053-K", "brand": "KC TRADING", "name": "대나무 젓가락 행운의 고양이 bamboo chopsticks lucky cat"},
    {"id": "L2054", "brand": "KC TRADING", "name": "고급 대나무 냄비 받침 사각 bamboo pot holder square"},
    {"id": "L2146", "brand": "KC TRADING", "name": "젓가락 45CM long cooking chopsticks"},
    {"id": "L2179-C", "brand": "KC TRADING", "name": "토시 방수 waterproof arm sleeve"},
    {"id": "L2216-A", "brand": "KC TRADING", "name": "대나무 티스푼 5PCS bamboo teaspoon 16CM"},
    {"id": "L2227", "brand": "KC TRADING", "name": "민속 핸드폰 고리 장구 Korean folk phone charm drum"},
    {"id": "L2235", "brand": "KC TRADING", "name": "먼지킬러 PVC dust killer PVC"},
    {"id": "L2339-A", "brand": "KC TRADING", "name": "민속 복주머니 핸드폰 고리 Korean folk lucky bag phone charm A"},
    {"id": "L2339-B", "brand": "KC TRADING", "name": "민속 복주머니 핸드폰 고리 Korean folk lucky bag phone charm B"},
    {"id": "L2460", "brand": "KC TRADING", "name": "멜라민 스푼 L 손잡이 전사 melamine spoon large"},
    {"id": "L2475", "brand": "KC TRADING", "name": "민속 자석 캔 오프너 한복 Korean folk magnet can opener"},
    {"id": "L2477", "brand": "KC TRADING", "name": "민속 열쇠고리 장구 Korean folk keychain drum"},
    {"id": "L2533-F", "brand": "KC TRADING", "name": "원목 표주박 20CM wood gourd ladle"},
    {"id": "L2668-A", "brand": "KC TRADING", "name": "멜라민 중국 스푼 RED 대 melamine Chinese spoon red large"},
    {"id": "L2669-A", "brand": "KC TRADING", "name": "멜라민 중국 스푼 ORANGE melamine Chinese spoon orange"},
    {"id": "L2669-C", "brand": "KC TRADING", "name": "멜라민 중국 스푼 BLACK melamine Chinese spoon black"},
    {"id": "L2670-A", "brand": "KC TRADING", "name": "멜라민 국자 RED 소 melamine ladle red small"},
    {"id": "L2770", "brand": "KC TRADING", "name": "대나무 젓가락 사각 bamboo chopsticks square"},
    {"id": "L2771", "brand": "KC TRADING", "name": "대나무 젓가락 레드 bamboo chopsticks red"},
    {"id": "L2954", "brand": "KC TRADING", "name": "S/S SOUP SCOOP W/HOLE 28CM XL"},
    {"id": "L2954-A", "brand": "KC TRADING", "name": "S/S SOUP SCOOP W/HOLE L 25CM"},
    {"id": "L2955-A", "brand": "KC TRADING", "name": "S/S SOUP SCOOP L 24CM"},
    {"id": "L2955-B", "brand": "KC TRADING", "name": "S/S SOUP SCOOP M"},
    {"id": "L3092-A", "brand": "KC TRADING", "name": "스텐 4P 포크 stainless 4P fork"},
    {"id": "L3141-B", "brand": "KC TRADING", "name": "바베큐 꼬치 38CM BBQ skewers 10PCS"},
    {"id": "L3177-A", "brand": "KC TRADING", "name": "고급형 누비 슬리퍼 여성용 quilted slipper women"},
    {"id": "L3177-B", "brand": "KC TRADING", "name": "고급형 누비 슬리퍼 남성용 quilted slipper men"},
    {"id": "L3415", "brand": "KC TRADING", "name": "스텐 미니 만두 건지기 대 stainless mini dumpling skimmer large 10CM"},
    {"id": "L3416", "brand": "KC TRADING", "name": "스텐 미니 만두 건지기 중 stainless mini dumpling skimmer medium 8CM"},
    {"id": "L3771", "brand": "KC TRADING", "name": "스텐 튀김 원형 핸들형 채반 30CM stainless frying strainer round"},
    {"id": "L4003", "brand": "KC TRADING", "name": "티크우드 뒤지개 구멍 teak wood spatula with hole 34CM"},
    {"id": "LG102214", "brand": "KC TRADING", "name": "EMPIRE TUMBLER 13.5 OZ glass"},
    {"id": "LG103006", "brand": "KC TRADING", "name": "계량컵 glass measuring cup 140ML"},
    {"id": "LG103009", "brand": "KC TRADING", "name": "텀블러 클래식 tumbler classic glass 8.7 OZ"},
    {"id": "MR536", "brand": "KC TRADING", "name": "적투톤 공기 red two tone rice bowl 15.5CM melamine"},
    {"id": "MR537", "brand": "KC TRADING", "name": "적투톤 대접 red two tone soup bowl 19CM melamine"},
    {"id": "MR601", "brand": "KC TRADING", "name": "적투톤 민2반 red two tone sauce dish melamine 7CM"},
    {"id": "MR941", "brand": "KC TRADING", "name": "적투톤 쌍초장 red two tone double sauce dish melamine"},
    {"id": "PM1001", "brand": "MALIE", "name": "ALOE ESSENCE MASK 25G Korean face mask"},
    {"id": "PM1002", "brand": "MALIE", "name": "COLLAGEN ESSENCE MASK 25G Korean face mask"},
    {"id": "PM1003", "brand": "MALIE", "name": "COENZYME Q10 ESSENCE MASK 25G Korean face mask"},
    {"id": "PM1005", "brand": "MALIE", "name": "GREEN TEA ESSENCE MASK 25G Korean face mask"},
    {"id": "PM1006", "brand": "MALIE", "name": "PEARL ESSENCE MASK 25G Korean face mask"},
    {"id": "PM1012", "brand": "MALIE", "name": "SEAWEED ESSENCE MASK 25G Korean face mask"},
    {"id": "PM1013", "brand": "MALIE", "name": "SNAIL ESSENCE MASK 25G Korean face mask"},
    {"id": "PM1015", "brand": "MALIE", "name": "STEM CELL ESSENCE MASK 25G Korean face mask"},
    {"id": "PM1016", "brand": "MALIE", "name": "VITAMIN ESSENCE MASK 25G Korean face mask"},
    {"id": "PO1001", "brand": "ORANGEROSES", "name": "ALOE AMPOULE MASK Korean face mask"},
    {"id": "PO1002", "brand": "ORANGEROSES", "name": "BLUEBERRY AMPOULE MASK Korean face mask"},
    {"id": "PO1004", "brand": "ORANGEROSES", "name": "CUCUMBER AMPOULE MASK Korean face mask"},
    {"id": "PO1007", "brand": "ORANGEROSES", "name": "PEARL AMPOULE MASK Korean face mask"},
    {"id": "PO1008", "brand": "ORANGEROSES", "name": "ROYALJELLY AMPOULE MASK Korean face mask"},
    {"id": "PO1009", "brand": "ORANGEROSES", "name": "TEA TREE AMPOULE MASK Korean face mask"},
    {"id": "PO1010", "brand": "ORANGEROSES", "name": "VITAMIN AMPOULE MASK Korean face mask"},
]


def sanitize_filename(item_id):
    """Make item ID safe for filename"""
    return item_id.replace("/", "_").replace("\\", "_").replace(":", "_").replace("*", "_").replace("?", "_").replace('"', "_").replace("<", "_").replace(">", "_").replace("|", "_")


def process_vendor(products, save_dir, vendor_name):
    """Process all products for a vendor"""
    total = len(products)
    success = 0
    failed = 0
    skipped = 0

    print(f"\n{'='*60}")
    print(f"Starting {vendor_name}: {total} products")
    print(f"Save directory: {save_dir}")
    print(f"{'='*60}")

    for i, product in enumerate(products):
        item_id = product["id"]
        safe_id = sanitize_filename(item_id)
        save_path = os.path.join(save_dir, f"{safe_id}.jpg")

        # Skip if already exists
        if os.path.exists(save_path):
            skipped += 1
            if (i + 1) % 10 == 0:
                print(f"  [{vendor_name}] Progress: {i+1}/{total} | Success: {success} | Skipped: {skipped} | Failed: {failed}")
            continue

        query = build_search_query(product["brand"], product["name"])

        # Search for image
        img_url = search_bing_image(query)

        if img_url:
            if download_and_save(img_url, save_path):
                success += 1
            else:
                failed += 1
        else:
            failed += 1

        # Print progress every 10 items
        if (i + 1) % 10 == 0:
            print(f"  [{vendor_name}] Progress: {i+1}/{total} | Success: {success} | Skipped: {skipped} | Failed: {failed}")

        # Small delay to avoid being blocked
        time.sleep(0.5)

    print(f"\n{'='*60}")
    print(f"{vendor_name} COMPLETE: {total} total | {success} downloaded | {skipped} skipped | {failed} failed")
    print(f"{'='*60}")
    return success, skipped, failed


if __name__ == "__main__":
    eden_dir = r"C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\images\eden"
    kc_dir = r"C:\Users\speci\OneDrive\Desktop\kimchi-mart-order\images\kctrading"

    print("Image Download Script for Eden & KC Trading")
    print(f"Eden products: {len(eden_products)}")
    print(f"KC Trading products: {len(kc_products)}")

    # Process Eden
    eden_s, eden_sk, eden_f = process_vendor(eden_products, eden_dir, "Eden")

    # Process KC Trading
    kc_s, kc_sk, kc_f = process_vendor(kc_products, kc_dir, "KC Trading")

    print(f"\n{'='*60}")
    print(f"FINAL SUMMARY")
    print(f"Eden: {eden_s} downloaded, {eden_sk} skipped, {eden_f} failed")
    print(f"KC Trading: {kc_s} downloaded, {kc_sk} skipped, {kc_f} failed")
    print(f"Total downloaded: {eden_s + kc_s}")
    print(f"{'='*60}")
