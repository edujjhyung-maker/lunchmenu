document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "https://open.neis.go.kr/hub/mealServiceDietInfo";
    const ATPT_CODE = "J10";      
    const SCHUL_CODE = "7781039";   

    let baseCalorie = 0, baseCarbo = 0, baseProtein = 0, baseFat = 0;
    
    // 고기와 디저트를 판별하기 위한 키워드
    const meatKeywords = ['돼지', '소고기', '돈육', '우육', '닭', '치킨', '스테이크', '불고기', '갈비', '제육', '탕수육', '돈까스', '치즈까스', '소시지', '햄', '오리', '떡갈비', '미트볼', '고기'];
    const dessertKeywords = ['케이크', '마카롱', '젤리', '아이스크림', '푸딩', '요구르트', '요거트', '주스', '음료', '쿠키', '빵', '핫도그', '과일', '수박', '사과', '바나나', '포도', '귤', '오렌지'];

    let favoriteItems = []; // 현재 식단에서 찾은 고기/디저트 목록 저장

    const datePicker = document.getElementById('date-picker');
    const loadingMsg = document.getElementById('loading-msg');
    const mealListEl = document.getElementById('meal-list');
    const favoriteListEl = document.getElementById('favorite-items-list');
    const calNumEl = document.getElementById('cal-num');
    const nutCarboEl = document.getElementById('nut-carbo');
    const nutProteinEl = document.getElementById('nut-protein');
    const nutFatEl = document.getElementById('nut-fat');
    const allergySummaryEl = document.getElementById('allergy-summary');
    const warningCard = document.getElementById('warning-card');
    const warningText = document.getElementById('warning-text');

    // 1. 오늘 날짜를 기본값으로 설정
    const today = new Date();
    datePicker.value = formatDateForInput(today);

    // 날짜가 변경될 때마다 급식 다시 불러오기
    datePicker.addEventListener('change', (e) => {
        loadSchoolMeal(new Date(e.target.value));
    });

    function formatDateForInput(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDateForApi(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    // 2. 급식 데이터 불러오기
    async function loadSchoolMeal(targetDate) {
        favoriteItems = [];
        favoriteListEl.innerHTML = '';
        loadingMsg.style.display = 'block';
        mealListEl.innerHTML = '';
        warningCard.classList.add('hidden');
        
        const apiDate = formatDateForApi(targetDate);
        const url = `${API_BASE_URL}?ATPT_OFCDC_SC_CODE=${ATPT_CODE}&SD_SCHUL_CODE=${SCHUL_CODE}&MLSV_YMD=${apiDate}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("네트워크 응답 오류");
            
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "application/xml");

            const resultCode = xmlDoc.getElementsByTagName("CODE")[0]?.textContent;
            if (resultCode !== "INFO-000") {
                showErrorMessage("선택한 날짜에는 급식 정보가 없어요! 🏖️");
                resetNutrition();
                return;
            }

            // 식단 파싱 및 고기/디저트 분류
            const rawDishText = xmlDoc.getElementsByTagName("DDISH_NM")[0]?.textContent || "";
            const cleanDishText = rawDishText.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            const dishLines = cleanDishText.split(/<br\s*\/?>|\n/);
            
            let uniqueAllergies = [];

            dishLines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    // 알레르기 추출
                    const allergyMatch = trimmedLine.match(/\(([0-9.]+)\)/);
                    if (allergyMatch) {
                        const numbers = allergyMatch[1].split('.');
                        numbers.forEach(num => {
                            if (num && !uniqueAllergies.includes(num)) uniqueAllergies.push(num);
                        });
                    }
                    
                    // 화면에 메뉴 추가
                    const li = document.createElement('li');
                    li.textContent = trimmedLine;
                    mealListEl.appendChild(li);

                    // 고기/디저트 판별 (알레르기 숫자 제거한 순수 이름으로 검사)
                    const cleanName = trimmedLine.replace(/\([^)]*\)/g, '').trim();
                    const isMeat = meatKeywords.some(kw => cleanName.includes(kw));
                    const isDessert = dessertKeywords.some(kw => cleanName.includes(kw));

                    if (isMeat || isDessert) {
                        favoriteItems.push({
                            name: cleanName,
                            type: isMeat ? 'meat' : 'dessert',
                            qty: 0
                        });
                    }
                }
            });

            // 기본 영양소 파싱
            const calText = xmlDoc.getElementsByTagName("CAL_INFO")[0]?.textContent || "0";
            baseCalorie = parseFloat(calText.replace(/[^0-9.]/g, '')) || 0;

            const ntrText = xmlDoc.getElementsByTagName("NTR_INFO")[0]?.textContent || "";
            baseCarbo = findNutrientValue(ntrText, "탄수화물");
            baseProtein = findNutrientValue(ntrText, "단백질");
            baseFat = findNutrientValue(ntrText, "지방");

            // 알레르기 요약
            if (uniqueAllergies.length > 0) {
                uniqueAllergies.sort((a, b) => parseInt(a) - parseInt(b));
                allergySummaryEl.textContent = `오늘 메뉴엔 [${uniqueAllergies.join(', ')}번] 알레르기 성분이 포함되어 있어요.`;
            } else {
                allergySummaryEl.textContent = "오늘 식단엔 등록된 알레르기 유발 성분이 없어요!";
            }

            loadingMsg.style.display = 'none';
            renderFavoriteItems();
            updateCalculatedNutrition();

        } catch (error) {
            console.error(error);
            showErrorMessage("급식을 가져오는 중에 문제가 생겼어요.");
        }
    }

    // 좋아하는 반찬(고기/디저트) UI 그리기
    function renderFavoriteItems() {
        if (favoriteItems.length === 0) {
            favoriteListEl.innerHTML = '<div class="empty-fav">오늘은 건강한 채소나 해산물 위주의 식단인가 봐요! 🥦🐟</div>';
            return;
        }

        favoriteItems.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'fav-item-row';
            
            const icon = item.type === 'meat' ? '🍖' : '🍰';
            
            row.innerHTML = `
                <div class="fav-name">${icon} ${item.name}</div>
                <div class="fav-controls">
                    <button class="btn-qty" data-index="${index}" data-action="minus" ${item.qty === 0 ? 'disabled' : ''}>-</button>
                    <span class="qty-display">${item.qty}</span>
                    <button class="btn-qty" data-index="${index}" data-action="plus">+</button>
                </div>
            `;
            favoriteListEl.appendChild(row);
        });

        // 버튼 이벤트 바인딩
        document.querySelectorAll('.btn-qty').forEach(btn => {
            btn.addEventListener('click', handleQtyChange);
        });
    }

    // 수량 조절 핸들러
    function handleQtyChange(e) {
        const index = e.target.getAttribute('data-index');
        const action = e.target.getAttribute('data-action');
        
        if (action === 'plus') {
            favoriteItems[index].qty += 1;
        } else if (action === 'minus' && favoriteItems[index].qty > 0) {
            favoriteItems[index].qty -= 1;
        }

        // 다시 그리기
        favoriteListEl.innerHTML = '';
        renderFavoriteItems();
        updateCalculatedNutrition();
    }

    // 추가된 수량에 맞춰 열량/영양소 계산 (추정치 반영)
    function updateCalculatedNutrition() {
        let totalCal = baseCalorie;
        let totalCarbo = baseCarbo;
        let totalProtein = baseProtein;
        let totalFat = baseFat;
        let extraTotalQty = 0; // 추가로 받은 총 그릇 수

        favoriteItems.forEach(item => {
            extraTotalQty += item.qty;
            if (item.type === 'meat') {
                // 고기 1회 추가 시 예상 영양소
                totalCal += item.qty * 150;
                totalCarbo += item.qty * 5;
                totalProtein += item.qty * 15;
                totalFat += item.qty * 10;
            } else if (item.type === 'dessert') {
                // 디저트 1회 추가 시 예상 영양소
                totalCal += item.qty * 100;
                totalCarbo += item.qty * 20;
                totalProtein += item.qty * 2;
                totalFat += item.qty * 2;
            }
        });

        calNumEl.textContent = totalCal.toFixed(1);
        nutCarboEl.textContent = totalCarbo.toFixed(1);
        nutProteinEl.textContent = totalProtein.toFixed(1);
        nutFatEl.textContent = totalFat.toFixed(1);

        // 경고 메시지 로직 (추가 배식이 2번 이상이거나 열량이 너무 높을 때)
        if (extraTotalQty === 0) {
            warningCard.classList.add('hidden');
        } else if (extraTotalQty >= 1 && extraTotalQty <= 2) {
            warningCard.classList.remove('hidden');
            warningText.innerHTML = `앗! 좋아하는 반찬을 더 받았더니 열량이 <strong>${totalCal.toFixed(0)} kcal</strong>로 늘어났어요!<br>한 끼 적정량에 맞춰서 밥과 다른 반찬의 양도 함께 조절해 보아요. 😉`;
        } else {
            warningCard.classList.remove('hidden');
            warningText.innerHTML = `우와, 너무 많이 더 받은 것 같아요! 지방과 당분이 크게 높아져 <strong>${totalCal.toFixed(0)} kcal</strong>가 되었어요.<br>배가 아프거나 몸이 무거워질 수 있으니, 친구들과 골고루 나누어 먹는 건 어떨까요? 🥦✨`;
        }
    }

    function findNutrientValue(text, nutrientName) {
        const regex = new RegExp(nutrientName + "[^:]*:\\s*([0-9.]+)");
        const match = text.match(regex);
        return match ? parseFloat(match[1]) : 0;
    }

    function showErrorMessage(message) {
        loadingMsg.textContent = message;
        loadingMsg.style.color = "#FF6B6B";
    }

    function resetNutrition() {
        calNumEl.textContent = '0';
        nutCarboEl.textContent = '0';
        nutProteinEl.textContent = '0';
        nutFatEl.textContent = '0';
    }

    // 앱 시작! 기본 날짜로 데이터 호출
    loadSchoolMeal(today);
});
