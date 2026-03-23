#!/usr/bin/env python3
"""
Translate Wang product Korean names to English for American managers.
Format: "English Name / 한국어이름"
"""

import re
import sys

# Comprehensive Korean food term dictionary (200+ terms)
DICTIONARY = {
    # === BRANDS ===
    "왕": "Wang",
    "수라상": "Surasang",
    "스키나": "Skina",
    "농심": "Nongshim",
    "삼양": "Samyang",
    "오뚜기": "Ottogi",
    "해태": "Haitai",
    "롯데": "Lotte",
    "롯데제과": "Lotte",
    "롯데빙과": "Lotte Ice",
    "롯데D": "Lotte",
    "빙그레": "Binggrae",
    "동원": "Dongwon",
    "CJ": "CJ",
    "청정원": "Chungjungone",
    "곰표": "Gompyo",
    "샘표": "Sempio",
    "담터": "Damteo",
    "일광": "Ilkwang",
    "일화": "Ilhwa",
    "동아": "Donga",
    "동화": "Donghwa",
    "웅진": "Woongjin",
    "정관장": "Cheong Kwan Jang",
    "맥심": "Maxim",
    "구겐": "Gugen",
    "하림": "Harim",
    "한백": "Hanbaek",
    "신미": "Shinmi",
    "섬마을": "Seommaul",
    "모란각": "Morangak",
    "올가랜드": "Orgaland",
    "둥지": "Dungji",
    "오향": "Ohyang",
    "몬": "Mon",
    "테스틀리": "Tastely",
    "아딸": "Addal",
    "움트리": "Oomtree",
    "녹차원": "Nokchawon",
    "죽마고우": "Jukmagou",
    "왕포차": "Wang Pocha",
    "학산": "Haksan",
    "씨실": "Siseal",
    "파이어스톤": "Firestone",
    "펭귄": "Penguin",
    "맘모스": "Mammoth",
    "공화춘": "Gonghwachun",
    "가도야": "Kadoya",
    "하봉정": "Habongjung",
    "다정": "Dajeong",
    "찬바다": "Chanbada",
    "동해": "Donghae",
    "서천": "Seocheon",
    "진주": "Jinju",
    "피쉬볼": "Fish Ball",

    # === RICE & GRAINS ===
    "쌀": "Rice",
    "찹쌀": "Sweet Rice",
    "현미": "Brown Rice",
    "현미쌀": "Brown Rice",
    "오분도미": "Half-Polished Rice",
    "흑미": "Black Rice",
    "스시라이스": "Sushi Rice",
    "한가위쌀": "Hangawi Rice",
    "햇반": "Instant Rice",
    "잡곡": "Mixed Grains",
    "보리": "Barley",
    "납작보리": "Pressed Barley",
    "쌀보리": "Rice Barley",
    "통보리": "Whole Barley",
    "녹두": "Mung Bean",
    "깐녹두": "Peeled Mung Bean",
    "통녹두": "Whole Mung Bean",
    "메주콩": "Soybean",
    "장수콩": "Longevity Bean",
    "서리태": "Black Bean",
    "검은콩": "Black Bean",
    "혼합5곡": "5-Grain Mix",
    "건강잡곡": "Healthy Mixed Grains",

    # === FLOUR & POWDER ===
    "밀가루": "Wheat Flour",
    "중력분": "All Purpose",
    "부침가루": "Pancake Mix",
    "튀김가루": "Frying Mix",
    "감자가루": "Potato Starch",
    "쌀가루": "Rice Flour",
    "찹쌀가루": "Sweet Rice Flour",
    "빵가루": "Bread Crumbs",
    "감자전분": "Potato Starch",

    # === SAUCES & SEASONINGS ===
    "간장": "Soy Sauce",
    "투고간장": "To-Go Soy Sauce",
    "물엿": "Corn Syrup",
    "흰물엿": "White Corn Syrup",
    "쌀엿": "Rice Syrup",
    "미린": "Mirin",
    "갈비양념": "Galbi Marinade",
    "불고기양념": "Bulgogi Marinade",
    "닭돼지불고기양념": "Chicken & Pork Bulgogi Marinade",
    "잡채양념": "Japchae Sauce",
    "김치핫소스": "Kimchi Hot Sauce",
    "교자소스": "Gyoza Sauce",
    "돈까스소스": "Tonkatsu Sauce",
    "양념치킨소스": "Seasoned Chicken Sauce",
    "떡볶이양념소스": "Tteokbokki Sauce",
    "김치 BASE 양념": "Kimchi Base Sauce",
    "순두부찌게양념": "Soft Tofu Stew Sauce",
    "마파두부 소스": "Mapo Tofu Sauce",
    "마파두부소스": "Mapo Tofu Sauce",
    "훠궈소스": "Hot Pot Sauce",
    "불고기 훠궈소스": "Bulgogi Hot Pot Sauce",
    "육개장 훠궈소스": "Spicy Beef Hot Pot Sauce",
    "해산물 훠궈소스": "Seafood Hot Pot Sauce",
    "김치로제파스타소스": "Kimchi Rose Pasta Sauce",
    "고추장소스": "Gochujang Sauce",
    "월남 망고칠리소스": "Vietnamese Mango Chili Sauce",
    "월남 칠리샤브스키소스": "Vietnamese Chili Shabu Sauce",
    "월남 파인애플쌈소스": "Vietnamese Pineapple Wrap Sauce",
    "월남쌈소스": "Vietnamese Wrap Sauce",
    "김치케첩": "Kimchi Ketchup",
    "참치액": "Tuna Extract",
    "생와사비": "Fresh Wasabi",
    "캡사이신액상": "Capsaicin Liquid",
    "약식원료": "Yakshik Ingredients",
    "식초": "Vinegar",
    "매실식초": "Plum Vinegar",
    "사과식초": "Apple Vinegar",
    "현미식초": "Brown Rice Vinegar",
    "강초": "Strong Vinegar",
    "매실엑기스": "Plum Extract",
    "초고추장": "Vinegared Red Pepper Paste",

    # === PASTE ===
    "고추장": "Gochujang (Red Pepper Paste)",
    "된장": "Doenjang (Soybean Paste)",
    "쌈장": "Ssamjang (Dipping Paste)",
    "짜장": "Jajang (Black Bean Paste)",
    "볶음짜장": "Stir-Fried Jajang Paste",
    "춘장": "Chunjang (Black Bean Paste)",
    "태양초찰고추장": "Sun-Dried Sticky Gochujang",
    "순창고추장": "Sunchang Gochujang",
    "매운고추장": "Spicy Gochujang",
    "볶음고추장": "Stir-Fried Gochujang",
    "글루텐프리 고추장": "Gluten-Free Gochujang",
    "컵고추장": "Cup Gochujang",
    "한식콩된장": "Korean Soybean Paste",
    "콩된장": "Soybean Paste",
    "옛날시골된장": "Traditional Country Doenjang",
    "청양초찌게된장": "Cheongyang Pepper Stew Doenjang",
    "삼겹살용쌈장": "Pork Belly Ssamjang",
    "고추장고추가루": "Gochujang Red Pepper Flakes",

    # === OIL ===
    "참기름": "Sesame Oil",
    "순참기름": "Pure Sesame Oil",
    "들기름": "Perilla Oil",

    # === SPICES ===
    "고추가루": "Red Pepper Flakes",
    "김치고추가루": "Kimchi Red Pepper Flakes",
    "유기농고추가루": "Organic Red Pepper Flakes",
    "유기농 김치용고추가루": "Organic Kimchi Red Pepper Flakes",
    "통계피": "Whole Cinnamon",
    "볶음통깨": "Roasted Sesame Seeds",
    "참깨": "Sesame Seeds",
    "깨소금": "Sesame Salt",
    "볶음검정참깨": "Roasted Black Sesame Seeds",

    # === SALT ===
    "소금": "Salt",
    "고운소금": "Fine Salt",
    "굵은소금": "Coarse Salt",
    "꽃소금": "Flower Salt",
    "맛소금": "Seasoning Salt",
    "김치절임소금": "Kimchi Pickling Salt",
    "진금함초소금": "Premium Hamcho Salt",
    "서해": "West Sea",
    "신안": "Shinan",

    # === SEAWEED ===
    "김": "Seaweed",
    "미역": "Miyeok (Seaweed)",
    "다시마": "Dashima (Kelp)",
    "구운김": "Roasted Seaweed",
    "김밥김": "Gimbap Seaweed",
    "김밥용구운김": "Gimbap Roasted Seaweed",
    "엄마손김밥김": "Mom's Hand Gimbap Seaweed",
    "말기편한 김밥김": "Easy-Roll Gimbap Seaweed",
    "말기편한김밥김": "Easy-Roll Gimbap Seaweed",
    "재래조선김": "Traditional Korean Seaweed",
    "자반맛돌김": "Seasoned Stone Laver",
    "멸치자반맛돌김": "Anchovy Seasoned Stone Laver",
    "스낵김": "Snack Seaweed",
    "바삭파삭김": "Crispy Seaweed",
    "와사비맛스낵김": "Wasabi Snack Seaweed",
    "김치맛스낵김": "Kimchi Snack Seaweed",
    "올리브유녹차김": "Olive Oil Green Tea Seaweed",
    "전통재래김전장": "Traditional Whole Seaweed",
    "파래김": "Green Laver Seaweed",
    "곱창돌김": "Premium Stone Laver",
    "돌자반파래": "Stone Seasoned Green Laver",
    "다시마튀각": "Fried Kelp Chips",
    "데마끼노리": "Temaki Nori (Hand Roll Seaweed)",
    "초사리 미역": "Chosari Miyeok",
    "고금도 돌각미역": "Gogeumdo Rock Seaweed",
    "고금도돌각미역": "Gogeumdo Rock Seaweed",
    "산모용실미역": "Postpartum Silk Seaweed",
    "청정미역": "Clean Miyeok",
    "생미역": "Fresh Miyeok",
    "줄기미역": "Stem Miyeok",
    "염장미역": "Salted Miyeok",
    "쌈용다시마": "Wrapping Kelp",
    "유기농 구운김": "Organic Roasted Seaweed",

    # === NOODLES ===
    "국수": "Noodles",
    "소면": "Thin Noodles",
    "진공소면": "Vacuum-Packed Thin Noodles",
    "막국수": "Buckwheat Noodles",
    "메밀막국수": "Buckwheat Cold Noodles",
    "메밀국수": "Buckwheat Noodles",
    "우동국수": "Udon Noodles",
    "우동": "Udon",
    "짜장국수": "Jajang Noodles",
    "칼국수": "Kalguksu (Knife-Cut Noodles)",
    "생우동": "Fresh Udon",
    "생메밀국수": "Fresh Buckwheat Noodles",
    "생소면": "Fresh Thin Noodles",
    "생우동짜장": "Fresh Udon Jajang",
    "생칼국수": "Fresh Kalguksu",
    "냉면": "Cold Noodles",
    "물냉면": "Water Cold Noodles",
    "평양냉면": "Pyongyang Cold Noodles",
    "당면": "Glass Noodles",
    "간편당면": "Easy Glass Noodles",
    "납작당면": "Flat Glass Noodles",
    "전통당면": "Traditional Glass Noodles",
    "특당면": "Premium Glass Noodles",
    "잔치당면": "Party Glass Noodles",
    "잡채당면": "Japchae Glass Noodles",
    "알뜰잡채당면": "Value Japchae Glass Noodles",
    "훠궈 당면": "Hot Pot Glass Noodles",
    "도토리 당면": "Acorn Glass Noodles",
    "샐러리 당면": "Celery Glass Noodles",
    "불지않는잔치 진당면": "Non-Sticky Party Glass Noodles",
    "나마우동": "Nama Udon",
    "도모시라가소면": "Tomoshiraga Somen",
    "사누끼우동": "Sanuki Udon",
    "사누끼냉동우동면": "Frozen Sanuki Udon",
    "쫄면": "Jjolmyeon (Chewy Noodles)",
    "밀면": "Wheat Noodles",
    "쌀국수": "Rice Noodles",
    "잡채": "Japchae",
    "바로먹는 잡채": "Ready-to-Eat Japchae",
    "잡채김말이": "Japchae Seaweed Roll",

    # === RAMEN ===
    "라면": "Ramen",
    "신라면": "Shin Ramen",
    "짜파게티": "Jjapaghetti",
    "너구리": "Neoguri",
    "안성탕면": "Ansungtangmyun",
    "불닭": "Buldak (Hot Chicken)",
    "불닭볶음면": "Buldak Hot Chicken Ramen",
    "불닭볶음우동": "Buldak Hot Chicken Udon",
    "김치라면": "Kimchi Ramen",
    "짬뽕": "Jjamppong (Spicy Seafood)",
    "삼선짬뽕": "Samseon Jjamppong",
    "컵라면": "Cup Ramen",
    "사발면": "Bowl Noodles",
    "큰사발면": "Big Bowl Noodles",
    "큰컵": "Big Cup",
    "멀티": "Multi-Pack",
    "오모리김치찌개라면": "Omori Kimchi Stew Ramen",
    "짜파구리": "Jjapaguri (Ram-Don)",
    "탄탄": "Tantan",
    "돈코츠": "Tonkotsu",
    "비건": "Vegan",
    "블랙": "Black",
    "골드": "Gold",
    "그린": "Green",

    # === INSTANT NOODLE FLAVORS ===
    "김치맛": "Kimchi Flavor",
    "해물맛": "Seafood Flavor",
    "가쓰오": "Bonito",
    "데리야끼": "Teriyaki",
    "뚝불": "Spicy Stir-Fry",
    "삼선 짜장": "Samseon Jajang",
    "올리브간짜장": "Olive Gan Jajang",
    "유부": "Fried Tofu",
    "해물": "Seafood",
    "바지락": "Clam",
    "육계장": "Spicy Beef Soup",
    "육개장": "Spicy Beef Soup",
    "곰탕": "Bone Broth Soup",
    "튀김우동": "Tempura Udon",
    "새우튀김우동": "Shrimp Tempura Udon",
    "매운버섯칼국수": "Spicy Mushroom Kalguksu",
    "김치말이잔치국수": "Kimchi Noodle Soup",
    "매운새우탕": "Spicy Shrimp Soup",
    "새우": "Shrimp",
    "치킨": "Chicken",
    "Beef": "Beef",
    "랍스터": "Lobster",

    # === KIMCHI ===
    "김치": "Kimchi",
    "맛김치": "Cut Kimchi",
    "포기김치": "Whole Kimchi",
    "갓김치": "Mustard Leaf Kimchi",
    "대파김치": "Green Onion Kimchi",
    "묵은지": "Aged Kimchi",
    "남도식": "Namdo-Style",
    "서울식": "Seoul-Style",
    "병김치": "Jar Kimchi",

    # === RICE CAKE ===
    "떡": "Rice Cake",
    "떡볶이": "Tteokbokki",
    "떡볶이떡": "Tteokbokki Rice Cake",
    "떡국떡": "Sliced Rice Cake",
    "쌀떡볶이떡": "Rice Tteokbokki",
    "가래떡떡볶이": "Bar Rice Cake Tteokbokki",
    "밀떡볶이": "Wheat Tteokbokki",
    "국물떡볶이": "Soup Tteokbokki",
    "신당동떡볶이": "Sindangdong Tteokbokki",
    "불닭볶음떡볶이": "Buldak Tteokbokki",
    "불닭까르보나라떡볶이": "Buldak Carbonara Tteokbokki",
    "전통떡국": "Traditional Rice Cake Soup",
    "로제떡볶이스낵": "Rose Tteokbokki Snack",
    "쫄볶이": "Jjolbokki (Chewy Tteokbokki)",
    "호떡": "Hotteok (Sweet Pancake)",
    "찹쌀호떡": "Sweet Rice Hotteok",
    "감자떡": "Potato Rice Cake",
    "송편": "Songpyeon",
    "흰송편": "White Songpyeon",
    "오색경단": "Five-Color Rice Ball",
    "찹쌀떡": "Sweet Rice Cake",
    "혼합경단": "Mixed Rice Ball",
    "두텁떡": "Duteoptteok (Layered Rice Cake)",
    "개떡": "Plain Rice Cake",

    # === DUMPLINGS ===
    "만두": "Dumpling",
    "왕교자": "King Gyoza Dumpling",
    "교자": "Gyoza Dumpling",
    "군만두": "Fried Dumpling",
    "물만두": "Boiled Dumpling",
    "왕만두": "King Dumpling",
    "잎새만두": "Leaf Dumpling",
    "물방울만두": "Drop Dumpling",
    "야끼만두": "Yaki Dumpling",
    "철판군만두": "Griddle Fried Dumpling",
    "만두피": "Dumpling Wrapper",
    "찹쌀만두피": "Sweet Rice Dumpling Wrapper",
    "찹쌀왕만두피": "Sweet Rice King Dumpling Wrapper",
    "김치만두": "Kimchi Dumpling",
    "부추만두": "Chive Dumpling",
    "야채만두": "Vegetable Dumpling",
    "갈비왕교자만두": "Galbi King Gyoza Dumpling",
    "김치왕교자 만두": "Kimchi King Gyoza Dumpling",
    "버섯만두": "Mushroom Dumpling",
    "샥스핀만두": "Shark Fin Dumpling",
    "고추잡채만두": "Pepper Japchae Dumpling",
    "명란군만두": "Pollack Roe Fried Dumpling",
    "잡채군만두": "Japchae Fried Dumpling",
    "오징어채 왕교자만두": "Dried Squid King Gyoza Dumpling",
    "수제비": "Sujebi (Hand-Pulled Dough)",
    "감자수제비": "Potato Sujebi",
    "새우춘권": "Shrimp Spring Roll",
    "돼지고기 만두": "Pork Dumpling",
    "소고기 만두": "Beef Dumpling",

    # === BREAD & BUNS ===
    "식빵": "White Bread",
    "호이호이": "Hoi Hoi (Bun)",
    "붕어": "Fish-Shaped Bread",
    "찐빵": "Steamed Bun",
    "단팥찐빵": "Red Bean Steamed Bun",
    "야채찐빵": "Vegetable Steamed Bun",
    "김치찐빵": "Kimchi Steamed Bun",
    "오색찐빵": "Five-Color Steamed Bun",
    "옥수수찐빵": "Corn Steamed Bun",
    "오징어찐빵": "Squid Steamed Bun",
    "단팥왕찐빵": "Red Bean King Steamed Bun",
    "쑥왕찐빵": "Mugwort King Steamed Bun",
    "옥수수왕찐빵": "Corn King Steamed Bun",
    "한입찐빵": "Bite-Size Steamed Bun",

    # === SEAFOOD ===
    "오징어": "Squid",
    "오징어채": "Dried Squid Strips",
    "낙지": "Octopus",
    "쭈꾸미": "Baby Octopus",
    "꽃게": "Blue Crab",
    "바지락": "Clam",
    "바지락살": "Shelled Clam",
    "바지락탕": "Clam Soup",
    "백합조개탕": "Venus Clam Soup",
    "오만디": "Sea Squirt",
    "미더덕": "Sea Squirt",
    "꼬막": "Cockle",
    "해파리": "Jellyfish",
    "해물모듬": "Assorted Seafood",
    "황태": "Dried Pollack",
    "황태코다리": "Dried Pollack Kodari",
    "황태채": "Dried Pollack Strips",
    "동태": "Frozen Pollack",
    "동태살": "Frozen Pollack Fillet",
    "전감": "Pre-Cut",
    "굴비": "Dried Yellow Croaker",
    "고등어": "Mackerel",
    "갈치": "Hairtail/Cutlassfish",
    "가자미": "Flounder",
    "아구": "Monkfish",
    "이면수": "Greenling",
    "멸치": "Anchovy",
    "다시멸치": "Stock Anchovy",
    "지리멸치": "Soup Anchovy",
    "볶음멸치": "Stir-Fried Anchovy",
    "명태채": "Dried Pollack Strips",
    "조미쥐포": "Seasoned Dried Filefish",
    "백진미": "Dried Squid (White)",
    "홍진미": "Dried Squid (Red)",
    "게맛살": "Crab Stick",
    "홍합": "Mussel",
    "반깐홍합": "Half-Shell Mussel",
    "우나기": "Unagi (Eel)",
    "새우젓": "Salted Shrimp",
    "오징어젓": "Salted Squid",
    "어리굴젓": "Seasoned Oyster",
    "명란젓": "Salted Pollack Roe",
    "어묵": "Fish Cake",
    "부산어묵": "Busan Fish Cake",
    "순도미살어묵": "Pure Sea Bream Fish Cake",
    "꼬지어묵": "Skewered Fish Cake",
    "사각어묵": "Square Fish Cake",
    "종합어묵오뎅": "Assorted Fish Cake Oden",
    "꼬치어묵": "Skewered Fish Cake",
    "물떡": "Rice Cake Stick",
    "노르웨이고등어 필렛": "Norway Mackerel Fillet",
    "노르웨이고등어": "Norway Mackerel",
    "서해굴비": "West Sea Croaker",

    # === MEAT ===
    "갈비": "Galbi (Short Ribs)",
    "불고기": "Bulgogi",
    "삼겹살": "Pork Belly",
    "삼계탕": "Samgyetang (Ginseng Chicken Soup)",
    "삼계탕재료": "Samgyetang Ingredients",
    "순대": "Sundae (Blood Sausage)",
    "소세지": "Sausage",
    "미니소세지": "Mini Sausage",
    "비엔나소세지": "Vienna Sausage",
    "소곱창소금구이": "Salt-Grilled Beef Tripe",
    "소대창양념구이": "Seasoned Beef Intestine",
    "소막창소금구이": "Salt-Grilled Beef Abomasum",
    "소막창 양념구이": "Seasoned Beef Abomasum",
    "소대창 곱도리탕": "Beef Intestine & Tripe Stew",
    "소불고기전골": "Bulgogi Hot Pot",
    "닭가슴살왕치킨까스": "Chicken Breast King Cutlet",
    "돈까스": "Tonkatsu (Pork Cutlet)",
    "왕돈까스": "King Tonkatsu",
    "순등심왕돈까스": "Pure Loin King Tonkatsu",
    "치즈왕돈까스": "Cheese King Tonkatsu",
    "어육햄": "Fish Meat Ham",
    "김밥어육햄": "Gimbap Fish Ham",

    # === TOFU ===
    "두부": "Tofu",
    "순두부": "Soft Tofu",
    "유부": "Fried Tofu",
    "유부초밥": "Inari Sushi",
    "햇살콩 유부": "Sunbeam Fried Tofu",

    # === SNACKS ===
    "과자": "Snack",
    "스낵": "Snack",
    "전병": "Rice Cracker",
    "쌀전병": "Rice Cracker",
    "쌀선과": "Rice Cookies",
    "뻥": "Puffed Snack",
    "쌀로뻥": "Rice Puff",
    "통밀뻥": "Whole Wheat Puff",
    "보리건빵": "Barley Hardtack",
    "누룽지": "Scorched Rice",
    "누룽지과자": "Scorched Rice Snack",
    "베개": "Pillow (Snack)",
    "팝스넥": "Pop Snack",
    "강냉이": "Corn Snack",
    "팝콘강냉이": "Popcorn Corn Snack",
    "마카로니": "Macaroni Snack",
    "꿀꽈배기": "Honey Twist",
    "새우깡": "Shrimp Crackers",
    "알새우칩": "Baby Shrimp Chips",
    "자갈치타코칩": "Jagalchi Taco Chips",
    "꽃게랑": "Crab Crackers",
    "허니버터칩": "Honey Butter Chips",
    "치토스": "Cheetos",
    "쵸코파이": "Choco Pie",
    "두부스낵": "Tofu Snack",
    "불닭 맛김": "Buldak Seasoned Seaweed",
    "롤전병": "Roll Cracker",
    "소라형": "Conch-Shaped",
    "오란다": "Oranda",
    "봉봉": "BongBong",
    "라면스낵": "Ramen Snack",
    "김맛": "Seaweed Flavor",
    "한입전병": "Bite-Size Rice Cracker",

    # === CANDY & SWEETS ===
    "사탕": "Candy",
    "캔디": "Candy",
    "젤리": "Jelly",
    "캬라멜": "Caramel",
    "박하사탕": "Peppermint Candy",
    "생강캔디": "Ginger Candy",
    "죽염사탕": "Bamboo Salt Candy",
    "자두캔디": "Plum Candy",
    "홍삼젤리": "Red Ginseng Jelly",
    "생강젤리": "Ginger Jelly",
    "연양갱": "Yokan (Sweet Bean Jelly)",
    "껌": "Gum",
    "졸음깨는껌": "Wake-Up Gum",
    "약과": "Yakgwa (Honey Cookie)",
    "찹쌀약과": "Sweet Rice Yakgwa",
    "유과": "Yugwa (Rice Puff Cookie)",
    "쑥유과": "Mugwort Yugwa",
    "연유과": "Lotus Yugwa",
    "군밤": "Roasted Chestnut",
    "유기농 까먹는군밤": "Organic Peeled Roasted Chestnut",
    "호박엿": "Pumpkin Taffy",
    "유가": "Yuga (Candy)",

    # === BEVERAGES ===
    "음료": "Beverage",
    "커피": "Coffee",
    "커피믹스": "Coffee Mix",
    "두유": "Soymilk",
    "까망두유": "Black Soymilk",
    "호두&아몬드두유": "Walnut & Almond Soymilk",
    "밀키스": "Milkis",
    "포카리스웨트": "Pocari Sweat",
    "박카스": "Bacchus",
    "까스활명수": "Gas Hwal Myung Su (Digestive)",
    "속청": "Sokcheong (Hangover Relief)",
    "홍삼": "Red Ginseng",
    "홍삼원": "Red Ginseng Drink",
    "홍삼뿌리드링크": "Red Ginseng Root Drink",
    "홍삼원POUCH": "Red Ginseng Pouch",
    "요고베라": "Yogobera",
    "알로에드림": "Aloe Dream",
    "아침햇살": "Morning Sunshine Rice Drink",
    "맥콜": "McCol",
    "밀키팝": "Milky Pop",
    "사이다": "Cider (Lemon-Lime Soda)",
    "천연사이다": "Natural Cider",
    "데미소다": "Demi Soda",
    "코코팜": "Coco Palm",
    "코코넛밀크": "Coconut Milk",
    "보리 드링크": "Barley Drink",
    "보리드링크": "Barley Drink",
    "커피맛우유": "Coffee Milk",
    "여주즙": "Bitter Melon Juice",
    "흑마늘": "Black Garlic",

    # === TEA ===
    "차": "Tea",
    "녹차": "Green Tea",
    "현미녹차": "Brown Rice Green Tea",
    "보리차": "Barley Tea",
    "옥수수차": "Corn Tea",
    "둥글레차": "Solomon's Seal Tea",
    "메밀차": "Buckwheat Tea",
    "결명자차": "Cassia Seed Tea",
    "유자차": "Citron Tea",
    "꿀유자차": "Honey Citron Tea",
    "꿀생강차": "Honey Ginger Tea",
    "꿀생강모과차": "Honey Ginger Quince Tea",
    "꿀생강유자차": "Honey Ginger Citron Tea",
    "꿀대추차": "Honey Jujube Tea",
    "꿀패션후르츠차": "Honey Passion Fruit Tea",
    "배도라지차": "Pear Bellflower Tea",
    "자몽코코차": "Grapefruit Coco Tea",
    "생강차": "Ginger Tea",
    "인삼생강차": "Ginseng Ginger Tea",
    "호두아몬드율무차": "Walnut Almond Job's Tears Tea",
    "발아현미율무차": "Sprouted Brown Rice Job's Tears Tea",
    "미숫가루": "Misutgaru (Multi-Grain Powder)",
    "우엉차": "Burdock Tea",
    "볶은우엉차": "Roasted Burdock Tea",
    "볶은율무차": "Roasted Job's Tears Tea",
    "볶은현미차": "Roasted Brown Rice Tea",
    "레몬라스베리꿀차": "Lemon Raspberry Honey Tea",
    "레몬생강꿀차": "Lemon Ginger Honey Tea",
    "자몽꿀차": "Grapefruit Honey Tea",
    "아임생생": "I'm Fresh",
    "보성유기농녹차": "Boseong Organic Green Tea",
    "유기농현미녹차": "Organic Brown Rice Green Tea",
    "유기농녹차가루": "Organic Green Tea Powder",

    # === PICKLES & SIDES ===
    "단무지": "Danmuji (Pickled Radish)",
    "통단무지": "Whole Pickled Radish",
    "반절단무지": "Half-Cut Pickled Radish",
    "욘본 단무지": "Yonbon Pickled Radish",
    "김밥속 단무지": "Gimbap Pickled Radish",
    "김밥용우엉": "Gimbap Burdock",
    "천사채": "Angel Hair (Clear Noodle Salad)",
    "마늘 짱아찌": "Garlic Pickles",
    "마늘쫑 간장": "Soy Sauce Garlic Stems",
    "쌈무": "Ssam Radish",
    "우무채": "Agar Strips",
    "고추지": "Pickled Pepper",
    "반찬": "Side Dish",
    "고들빼기": "Korean Lettuce (Pickled)",
    "고추무침": "Seasoned Pepper",
    "파래무침": "Seasoned Green Laver",
    "쌀게 무침": "Seasoned Rice Crab",
    "마늘쫑무침": "Seasoned Garlic Stems",
    "양념햇깻잎": "Seasoned Perilla Leaves",
    "연근조림": "Braised Lotus Root",
    "멸치고추장볶음": "Anchovy Gochujang Stir-Fry",
    "멸치고추볶음": "Anchovy Pepper Stir-Fry",
    "명태채무침": "Seasoned Dried Pollack",

    # === READY MEALS ===
    "나물비빔밥": "Vegetable Bibimbap",
    "사골곰탕": "Ox Bone Soup",
    "황태해장국": "Dried Pollack Hangover Soup",
    "버섯육개장": "Mushroom Spicy Beef Soup",
    "낙지전골": "Octopus Hot Pot",
    "알탕": "Fish Roe Soup",
    "해물잡탕": "Seafood Stew",
    "오징어탕수": "Sweet & Sour Squid",
    "오징어물회": "Raw Squid Salad",
    "해물칼국수": "Seafood Kalguksu",
    "장칼국수": "Soybean Paste Kalguksu",
    "들깨칼국수": "Perilla Seed Kalguksu",
    "매운불밀면": "Spicy Fire Wheat Noodles",
    "춘하추동": "Chunhachudong (All Season)",
    "장충동": "Jangchungdong",

    # === KONNYAKU / KONJAC ===
    "곤약": "Konjac",
    "곤약말이": "Konjac Roll",
    "묵곤약": "Muk Konjac",
    "실곤약": "Thread Konjac",
    "파래 곤약": "Green Laver Konjac",
    "해초곤약": "Seaweed Konjac",

    # === FROZEN / PREPARED ===
    "핫도그": "Hot Dog",
    "반반핫도그": "Half & Half Hot Dog",
    "감자핫도그": "Potato Hot Dog",
    "모짜렐라": "Mozzarella",
    "체다치즈": "Cheddar Cheese",
    "할라피뇨": "Jalapeno",
    "쌀떡": "Rice Cake",
    "고로케": "Croquette",
    "야채고로케": "Vegetable Croquette",
    "카레고로케": "Curry Croquette",
    "토네이도 감자": "Tornado Potato",
    "찰옥수수": "Sticky Corn",
    "에다마메": "Edamame",
    "깐생밤": "Peeled Chestnut",
    "쭈꾸미볶음": "Stir-Fried Baby Octopus",

    # === ICE CREAM ===
    "아이스크림": "Ice Cream",
    "아이스": "Ice Cream",
    "모찌아이스": "Mochi Ice Cream",
    "메로나": "Melona",
    "인절미아이스": "Injeolmi Ice Cream",
    "붕어싸만코": "Bungeoppang Samanco",
    "싸만코": "Samanco",
    "비비빅": "BibiBig",
    "더위사냥": "Beat the Heat Bar",
    "투게더": "Together",
    "뽕따": "Bbongdda",
    "생귤탱귤": "Fresh Tangerine",
    "엑설런트": "Excellent",
    "빵또아": "Pangtoa",
    "설레임": "Seolleim",
    "수박바": "Watermelon Bar",
    "스크류바": "Screw Bar",
    "죠스바": "Jaws Bar",
    "그릭요구르트바": "Greek Yogurt Bar",

    # === FLAVORS ===
    "딸기": "Strawberry",
    "망고": "Mango",
    "메론": "Melon",
    "복숭아": "Peach",
    "수박": "Watermelon",
    "코코넛": "Coconut",
    "파인애플": "Pineapple",
    "바나나": "Banana",
    "포도": "Grape",
    "패션후르츠": "Passion Fruit",
    "녹차": "Green Tea",
    "초코": "Chocolate",
    "쿠앤크": "Cookies & Cream",
    "레드벨벳": "Red Velvet",
    "흑당밀크티": "Brown Sugar Milk Tea",
    "쿠키앤크림": "Cookies & Cream",
    "피스타치오": "Pistachio",
    "샤인머스캣": "Shine Muscat",
    "블루베": "Blueberry",
    "더블베리": "Double Berry",
    "맹고파인": "Mango Pineapple",
    "오리지널": "Original",
    "오리지날": "Original",
    "밀크": "Milk",
    "화이트": "White",
    "모카": "Mocha",
    "와사비": "Wasabi",
    "BBQ": "BBQ",

    # === MODIFIERS ===
    "매운맛": "Spicy",
    "매운": "Spicy",
    "순한맛": "Mild",
    "얼큰한맛": "Spicy",
    "매콤달콤": "Sweet & Spicy",
    "매콤": "Spicy",
    "HOT": "Hot",
    "MILD": "Mild",
    "EXTRA": "Extra",
    "유기농": "Organic",
    "전통": "Traditional",
    "한국산": "Korean",
    "한국": "Korean",
    "남해": "Namhae",
    "완도산": "Wando",
    "통영산": "Tongyeong",
    "독일": "German",
    "태국산": "Thai",
    "뉴질랜드": "New Zealand",
    "냉동": "Frozen",
    "식당용": "Restaurant Use",
    "벌크": "Bulk",

    # === NON-FOOD ===
    "나무젓가락": "Wooden Chopsticks",
    "대나무젓가락": "Bamboo Chopsticks",
    "면장갑": "Cotton Gloves",
    "적코팅장갑": "Red-Coated Gloves",
    "부탄가스": "Butane Gas",
    "가스쿠커": "Gas Cooker",
    "치약": "Toothpaste",
    "죽염치약": "Bamboo Salt Toothpaste",

    # === MISC ===
    "주먹밥": "Rice Ball",
    "야채": "Vegetable",
    "버섯": "Mushroom",
    "표고버섯": "Shiitake Mushroom",
    "건표고버섯": "Dried Shiitake Mushroom",
    "목이버섯": "Wood Ear Mushroom",
    "자연 한알": "Nature One Pill",
    "곤약 제리": "Konjac Jelly",
    "요구르트": "Yogurt",
    "빅요구르트": "Big Yogurt",
    "쑥": "Mugwort",
    "콩쑥개떡": "Bean Mugwort Rice Cake",
    "들깨": "Perilla Seed",
    "옥수수": "Corn",
    "사자표": "Lion Brand",
    "꽃게랑불짬뽕": "Crab Jjamppong Flavor",
    "핫붕어미니싸만코": "Hot Mini Fish Samanco",
    "88서울": "88 Seoul",
    "원할머니": "Grandma Won",
    "팥": "Red Bean",
    "서울": "Seoul",
    "부산": "Busan",
    "마": "Yam",
    "15곡": "15-Grain",
}

# Additional patterns that need special handling
BRAND_PREFIXES = {
    "F ": "F ",  # Frozen prefix
    "F수라상": "F Surasang",
    "F 수라상": "F Surasang",
    "F 왕": "F Wang",
    "F왕": "F Wang",
    "수라상": "Surasang",
    "스키나": "Skina",
    "왕": "Wang",
    "왕)": "Wang",
    "왕 ": "Wang",
}


def translate_name(korean_name):
    """Translate a Korean product name to English."""
    original = korean_name.strip()

    # Keep the size/quantity info (numbers with units like LBS, oz, kg, ml, etc.)
    # We'll try to translate the descriptive parts and keep packaging info

    # First, try longest matches from dictionary
    result = original
    translated_parts = []
    remaining = original

    # Sort dictionary by length of key (longest first) for greedy matching
    sorted_terms = sorted(DICTIONARY.items(), key=lambda x: len(x[0]), reverse=True)

    # Track which parts we've translated
    used_ranges = []

    for korean, english in sorted_terms:
        # Find all occurrences of this term
        start = 0
        while True:
            idx = remaining.find(korean, start)
            if idx == -1:
                break
            end = idx + len(korean)

            # Check if this range overlaps with already used ranges
            overlaps = False
            for used_start, used_end in used_ranges:
                if idx < used_end and end > used_start:
                    overlaps = True
                    break

            if not overlaps:
                translated_parts.append((idx, end, english))
                used_ranges.append((idx, end))

            start = idx + 1

    if not translated_parts:
        return f"{original} / {original}"

    # Sort by position
    translated_parts.sort(key=lambda x: x[0])

    # Build the English name
    english_parts = []
    last_end = 0

    for start, end, english in translated_parts:
        # Add any untranslated text between parts (numbers, units, etc.)
        if start > last_end:
            gap = remaining[last_end:start].strip()
            if gap:
                english_parts.append(gap)
        english_parts.append(english)
        last_end = end

    # Add any remaining text
    if last_end < len(remaining):
        tail = remaining[last_end:].strip()
        if tail:
            english_parts.append(tail)

    english_name = " ".join(english_parts)

    # Clean up multiple spaces
    english_name = re.sub(r'\s+', ' ', english_name).strip()

    # Clean up parentheses and special chars
    english_name = english_name.replace("( ", "(").replace(" )", ")")

    return f"{english_name} / {original}"


def process_file(filepath):
    """Read products.js, translate Wang product names, write back."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')

    # Find Wang section boundaries
    wang_start = None
    wang_products_start = None
    wang_end = None
    in_wang = False
    bracket_depth = 0

    for i, line in enumerate(lines):
        if 'wang: {' in line or 'wang:{' in line:
            wang_start = i
            in_wang = True
            bracket_depth = 1
            continue

        if in_wang and wang_products_start is None and 'products: [' in line:
            wang_products_start = i
            continue

        if in_wang:
            bracket_depth += line.count('{') + line.count('[')
            bracket_depth -= line.count('}') + line.count(']')
            if bracket_depth <= 0:
                wang_end = i
                break

    if wang_start is None or wang_products_start is None:
        print("ERROR: Could not find Wang section!")
        sys.exit(1)

    print(f"Wang section: lines {wang_start+1} to {wang_end+1}")
    print(f"Wang products start: line {wang_products_start+1}")

    # Process each product line in the Wang section
    product_pattern = re.compile(
        r'(\s*\{\s*id:\s*"[^"]*",\s*brand:\s*"[^"]*",\s*name:\s*)"([^"]*)"'
    )

    count = 0
    for i in range(wang_products_start + 1, wang_end):
        line = lines[i]
        match = product_pattern.search(line)
        if match:
            korean_name = match.group(2)
            english_name = translate_name(korean_name)
            # Replace the name field value
            lines[i] = line.replace(f'name: "{korean_name}"', f'name: "{english_name}"', 1)
            count += 1

    print(f"Translated {count} Wang products")

    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print("File updated successfully!")


if __name__ == '__main__':
    process_file('C:/Users/speci/OneDrive/Desktop/kimchi-mart-order/products.js')
