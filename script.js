document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "https://open.neis.go.kr/hub/mealServiceDietInfo";
    const ATPT_CODE = "J10";      
    const SCHUL_CODE = "7781039";   

    // 기본 급식 영양소 보관
    let baseCalorie = 0, baseCarbo = 0, baseProtein = 0, baseFat = 0;
    let menuItems = []; // 파싱된 메뉴 객체 배열

    // 식품군 키워드 사전 (예상 영양소 계산용)
    const foodCategories = {
        meat_fried: {
            keywords: ['돼지', '소고기', '닭', '치킨', '돈까스', '튀김', '스테이크', '불고기', '갈비', '햄', '소시지', '제육', '탕수육', '미트볼', '고기'],
            est: { cal: 150, carbo: 5, protein: 12, fat: 10 }
        },
        carb_dessert: {
            keywords: ['밥', '면', '떡', '빵', '케이크', '마카롱', '아이스크림', '주스', '과일', '스파게티', '우동', '핫도그', '수제비'],
            est: { cal: 120, carbo: 25, protein: 2, fat: 2 }
        },
        veggie_soup: {
            keywords: ['국', '탕', '찌개', '나물', '무침', '김치', '샐러드', '채소', '두부', '해산물', '생선', '멸치'],
            est: { cal: 40, carbo: 5, protein: 3, fat: 1 }
        },
        default: {
            est: { cal: 80, carbo: 10, protein: 5, fat: 2 }
        }
    };

    const datePicker = document.getElementById('date-picker');
    const loadingMsg = document.getElementById('loading-msg');
    const interactiveListEl = document.getElementById('interactive-meal-list');
    const calNumEl = document.getElementById('cal-num');
    const nutCarboEl = document.getElementById('nut-carbo');
    const nutProteinEl = document.getElementById('nut-protein');
    const nutFatEl = document.getElementById('nut-fat');
    const allergySummaryEl = document.getElementById('allergy-summary');
    const feedbackTextEl = document.getElementById('feedback-text');

    // 1. 날짜 설정 및 이벤트 리스너
    const today = new Date();
    datePicker.value = formatDateForInput(today);
    datePicker.addEventListener('change', (e) => loadSchoolMeal(new Date(e.target.value)));

    function formatDateForInput(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDateForApi(date) {
        return date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
    }

    // 2. 급식 데이터 불러오기
    async function loadSchoolMeal(targetDate) {
        menuItems = [];
        interactiveListEl.innerHTML = '';
        loadingMsg.style.display = 'block';
        feedbackTextEl.innerHTML = '오늘의 급식 메뉴가 나왔어요! 골고루 맛있게 먹어보아요. 🍚';
        
        const apiDate = formatDateForApi(targetDate);
        const url = `${API_BASE_URL}?ATPT_OFCDC_SC_CODE=${ATPT_CODE}&SD_SCHUL_CODE=${SCHUL_CODE}&MLSV_YMD=${apiDate}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("네트워크 오류");
            
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "application/xml");

            const resultCode = xmlDoc.getElementsByTagName("CODE")[0]?.textContent;
            if (resultCode !== "INFO-000") {
                showErrorMessage("선택한 날짜에는 급식 정보가 없어요! 🏖️");
                resetNutrition();
                return;
            }

            // 식단 텍스트 파싱
            const rawDishText = xmlDoc.getElementsByTagName("DDISH_NM")[0]?.textContent || "";
            const cleanDishText = rawDishText.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            const dishLines = cleanDishText.split(/<br\s*\/?>|\n/);
            
            let uniqueAllergies = [];

            dishLines.forEach((line, index) => {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    // 알레르기 수집
                    const allergyMatch = trimmedLine.match(/\(([0-9.]+)\)/);
                    if (allergyMatch) {
                        allergyMatch[1].split('.').forEach(num => {
                            if (num && !uniqueAllergies.includes(num)) uniqueAllergies.push(num);
                        });
                    }
                    
                    // 메뉴 카테고리 분석
                    const cleanName = trimmedLine.replace(/\([^)]*\)/g, '').replace(/[^가-힣a-zA-Z0-9 ]/g, '').trim();
                    let category = 'default';
                    if (foodCategories.meat_fried.keywords.some(kw => cleanName.includes(kw))) category = 'meat_fried';
                    else if (foodCategories.carb_dessert.keywords.some(kw => cleanName.includes(kw))) category = 'carb_dessert';
                    else if (foodCategories.veggie_soup.keywords.some(kw => cleanName.includes(kw))) category = 'veggie_soup';

                    menuItems.push({
                        id: index,
                        fullName: trimmedLine,
                        cleanName: cleanName,
                        category: category,
                        qty: 0,
                        est: foodCategories[category].est
                    });
                }
            });

            // 기본 영양소
            const calText = xmlDoc.getElementsByTagName("CAL_INFO")[0]?.textContent || "0";
            baseCalorie = parseFloat(calText.replace(/[^0-9.]/g, '')) || 0;
            const ntrText = xmlDoc.getElementsByTagName("NTR_INFO")[0]?.textContent || "";
            baseCarbo = findNutrientValue(ntrText, "탄수화물");
            baseProtein = findNutrientValue(ntrText, "단백질");
            baseFat = findNutrientValue(ntrText, "지방");

            // 알레르기 안내
            if (uniqueAllergies.length > 0) {
                uniqueAllergies.sort((a, b) => parseInt(a) - parseInt(b));
                allergySummaryEl.textContent = `오늘 메뉴엔 [${uniqueAllergies.join(', ')}번] 알레르기 성분이 포함되어 있어요. 자신의 알레르기 번호를 꼭 확인하세요!`;
            } else {
                allergySummaryEl.textContent = "오늘 식단엔 등록된 알레르기 유발 성분이 없어요!";
            }

            loadingMsg.style.display = 'none';
            renderInteractiveList();
            calculateAndFeedback();

        } catch (error) {
            console.error(error);
            showErrorMessage("급식을 가져오는 중에 문제가 생겼어요.");
        }
    }

    // 3. 상호작용 가능한 메뉴 리스트 렌더링
    function renderInteractiveList() {
        interactiveListEl.innerHTML = '';
        menuItems.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = `meal-row ${item.qty > 0 ? 'active' : ''}`;
            
            row.innerHTML = `
                <div class="meal-name">${item.fullName}</div>
                <div class="meal-controls">
                    <button class="btn-qty" data-index="${index}" data-action="minus" ${item.qty === 0 ? 'disabled' : ''}>-</button>
                    <span class="qty-display">${item.qty}</span>
                    <button class="btn-qty" data-index="${index}" data-action="plus">+</button>
                </div>
            `;
            interactiveListEl.appendChild(row);
        });

        document.querySelectorAll('.btn-qty').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                const action = e.target.getAttribute('data-action');
                
                if (action === 'plus') menuItems[index].qty += 1;
                else if (action === 'minus' && menuItems[index].qty > 0) menuItems[index].qty -= 1;
                
                renderInteractiveList(); // 화면 다시 그리기
                calculateAndFeedback();  // 영양 및 피드백 업데이트
            });
        });
    }

    // 4. 열량 계산 및 맞춤형 피드백 제공
    function calculateAndFeedback() {
        let finalCal = baseCalorie;
        let finalCarbo = baseCarbo;
        let finalProtein = baseProtein;
        let finalFat = baseFat;

        let totalAdded = 0;
        let addedMeat = 0;
        let addedDessert = 0;
        let addedVeggie = 0;

        menuItems.forEach(item => {
            if (item.qty > 0) {
                totalAdded += item.qty;
                if (item.category === 'meat_fried') addedMeat += item.qty;
                if (item.category === 'carb_dessert') addedDessert += item.qty;
                if (item.category === 'veggie_soup') addedVeggie += item.qty;

                finalCal += item.est.cal * item.qty;
                finalCarbo += item.est.carbo * item.qty;
                finalProtein += item.est.protein * item.qty;
                finalFat += item.est.fat * item.qty;
            }
        });

        // 화면 수치 업데이트
        calNumEl.textContent = finalCal.toFixed(1);
        nutCarboEl.textContent = finalCarbo.toFixed(1);
        nutProteinEl.textContent = finalProtein.toFixed(1);
        nutFatEl.textContent = finalFat.toFixed(1);

        // 피드백 로직
        if (totalAdded === 0) {
            feedbackTextEl.innerHTML = `정해진 양만큼 골고루 먹으려고 노력하는 모습이 멋져요! 👍 이대로 쭉 바른 식생활을 유지해보아요.`;
            feedbackTextEl.style.color = "#1C7ED6";
        } else if (finalCal > 1000) {
            feedbackTextEl.innerHTML = `앗! 열량이 <strong>${finalCal.toFixed(0)}kcal</strong>로 초등학생 한 끼 권장량(약 600kcal)을 훌쩍 넘었어요. 너무 많이 먹으면 오후 수업 때 졸리거나 배가 아플 수 있으니 욕심을 조금 줄여볼까요? 🥺`;
            feedbackTextEl.style.color = "#C92A2A";
        } else if (addedMeat > 0 && addedVeggie === 0) {
            feedbackTextEl.innerHTML = `고기나 튀김 반찬을 좋아하군요! 하지만 영양을 맞추려면 나물이나 국 같은 채소 반찬도 곁들여 먹어야 몸이 튼튼해진답니다. 🥦💪`;
            feedbackTextEl.style.color = "#E67E22";
        } else if (addedDessert > 0) {
            feedbackTextEl.innerHTML = `달콤한 밥이나 디저트를 더 받았군요! 에너지가 쑥쑥 나겠지만, 다 먹고 나서 양치질을 꼼꼼히 하는 것 잊지 마세요! 🪥✨`;
            feedbackTextEl.style.color = "#1C7ED6";
        } else if (addedVeggie > 0) {
            feedbackTextEl.innerHTML = `채소가 들어간 반찬을 더 챙겨 먹다니, 정말 대단해요! 비타민과 무기질이 풍부해져서 면역력이 쑥쑥 올라갈 거예요. 🥗✨`;
            feedbackTextEl.style.color = "#27AE60";
        } else {
            feedbackTextEl.innerHTML = `반찬을 <strong>${totalAdded}번</strong> 더 받았어요. 맛있는 반찬을 잘 먹는 것도 좋지만, 잔반을 남기지 않도록 먹을 수 있는 만큼만 받는 것이 환경을 사랑하는 길이에요! 🌏🌱`;
            feedbackTextEl.style.color = "#1C7ED6";
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

    // 앱 시작
    loadSchoolMeal(today);
});
