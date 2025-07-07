// 전역 변수
let currentBook = '';
let currentFontSize = 27; // 기본 크기를 27px로 변경
let currentChapter = '';
const minFontSize = 27; // 최소 크기
const maxFontSize = 37; // 최대 크기

// 데이터 캐시 시스템
const chapterDataCache = new Map();

// 서비스 워커 등록 및 PWA 설치 관리
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then((registration) => {
                console.log('SW 등록 성공: ', registration.scope);
                
                // 업데이트 확인
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // 새 버전 사용 가능 알림
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch((registrationError) => {
                console.log('SW 등록 실패: ', registrationError);
            });
    });
}

// PWA 설치 프롬프트 관리
let deferredPrompt;
let installButton;

window.addEventListener('beforeinstallprompt', (e) => {
    console.log('PWA 설치 프롬프트 준비됨');
    e.preventDefault();
    deferredPrompt = e;
    
    // 설치 버튼 표시
    showInstallButton();
});

// PWA 설치 완료 감지
window.addEventListener('appinstalled', (evt) => {
    console.log('PWA 설치 완료');
    hideInstallButton();
    
    // 설치 완료 알림
    showInstallSuccessMessage();
});

// 앱 초기화 (PWA 기능 포함)
document.addEventListener('DOMContentLoaded', function() {
    // 초기 화면 설정
    showScreen('main-screen');
    
    // 폰트 크기 초기화
    updateFontSize();
    
    // PWA 기능 초기화
    setupConnectionMonitoring();
    
    // PWA 설치 상태 확인
    if (isPWAInstalled()) {
        console.log('PWA 모드로 실행 중');
        hideInstallButton();
    }
    
    // URL 파라미터 확인 (바로가기 지원)
    checkURLParameters();
    
    // 캐시 상태 확인 (개발용)
    setTimeout(async () => {
        const cacheStatus = await getCacheStatus();
        if (cacheStatus) {
            console.log('캐시 정보:', cacheStatus);
        }
    }, 2000);
});

// URL 파라미터 확인 (바로가기 지원)
function checkURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const book = urlParams.get('book');
    
    if (book === 'revelation' || book === 'isaiah') {
        // 바로가기로 접근한 경우
        setTimeout(() => {
            selectBook(book);
        }, 500);
    }
}

// 화면 전환 함수
function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    
    screens.forEach(screen => {
        screen.classList.remove('active', 'slide-out');
        
        if (screen.id === screenId) {
            screen.classList.add('active');
        }
    });
}

// 부드러운 화면 전환 (오른쪽에서 왼쪽으로)
function slideToScreen(targetScreenId) {
    const currentScreen = document.querySelector('.screen.active');
    const targetScreen = document.getElementById(targetScreenId);
    
    if (currentScreen && targetScreen) {
        // 현재 화면을 왼쪽으로 슬라이드
        currentScreen.classList.add('slide-out');
        
        // 새 화면을 오른쪽에서 슬라이드 인
        setTimeout(() => {
            currentScreen.classList.remove('active', 'slide-out');
            targetScreen.classList.add('active');
        }, 200);
    }
}

// 책 선택 함수
function selectBook(book) {
    if (!book || (book !== 'revelation' && book !== 'isaiah')) {
        console.error('잘못된 책 선택:', book);
        return;
    }
    
    currentBook = book;
    
    // 책 제목 설정
    const contentTitle = document.getElementById('current-chapter-title');
    if (book === 'revelation') {
        contentTitle.textContent = '요한계시록';
        populateChapterSelect(22); // 1-22장
    } else if (book === 'isaiah') {
        contentTitle.textContent = '이사야';
        populateChapterSelect(66); // 1-66장
    }
    
    // 강해 내용 화면으로 전환
    slideToScreen('content-screen');
    
    // 첫 번째 몇 개 장 프리로드 (성능 최적화)
    setTimeout(() => {
        preloadChapter(book, 1);
        preloadChapter(book, 2);
        preloadChapter(book, 3);
    }, 500);
}

// 장 선택 옵션 생성 (새로운 드롭다운 방식)
function populateChapterSelect(maxChapter) {
    const dropdownContent = document.getElementById('dropdown-content');
    if (!dropdownContent) {
        console.error('드롭다운 컨텐츠 요소를 찾을 수 없습니다');
        return;
    }
    
    dropdownContent.innerHTML = '';
    
    for (let i = 1; i <= maxChapter; i++) {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = `${i}장`;
        item.onclick = () => selectChapter(i);
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '0');
        dropdownContent.appendChild(item);
    }
}

// 드롭다운 토글
function toggleChapterDropdown() {
    const dropdown = document.getElementById('chapter-dropdown');
    const arrow = document.querySelector('.dropdown-arrow');
    
    if (!dropdown || !arrow) {
        console.error('드롭다운 요소를 찾을 수 없습니다');
        return;
    }
    
    dropdown.classList.toggle('hidden');
    arrow.classList.toggle('rotated');
}

// 드롭다운 닫기
function closeChapterDropdown() {
    const dropdown = document.getElementById('chapter-dropdown');
    const arrow = document.querySelector('.dropdown-arrow');
    
    if (dropdown && arrow) {
        dropdown.classList.add('hidden');
        arrow.classList.remove('rotated');
    }
}

// 장 선택
function selectChapter(chapter) {
    if (!chapter || chapter < 1) {
        console.error('잘못된 장 번호:', chapter);
        return;
    }
    
    if (!currentBook) {
        console.error('책이 선택되지 않았습니다');
        return;
    }
    
    currentChapter = chapter;
    
    // 제목 업데이트
    const title = document.getElementById('current-chapter-title');
    const bookName = currentBook === 'revelation' ? '계시록' : '이사야';
    if (title) {
        title.textContent = `${bookName} ${chapter}장`;
    }
    
    // 드롭다운 닫기
    closeChapterDropdown();
    
    // 장 내용 로드
    loadChapterByNumber(chapter);
    
    // 인접 장 프리로드
    preloadAdjacentChapters(currentBook, chapter);
}

// 장 번호로 직접 로드
async function loadChapterByNumber(chapter) {
    const contentText = document.getElementById('content-text');
    if (!contentText) {
        console.error('콘텐츠 텍스트 요소를 찾을 수 없습니다');
        return;
    }
    
    // 로딩 표시
    showLoadingState(contentText);
    
    try {
        // 캐시에서 먼저 확인
        const cacheKey = `${currentBook}-${chapter}`;
        if (chapterDataCache.has(cacheKey)) {
            console.log('캐시에서 데이터 로드:', cacheKey);
            displayChapterContent(chapterDataCache.get(cacheKey), chapter);
            return;
        }
        
        // 파일 경로 구성
        const filePath = getChapterFilePath(currentBook, chapter);
        console.log('파일 로드 시도:', filePath);
        
        // 파일 로드
        const response = await fetch(filePath);
        
        if (!response.ok) {
            throw new Error(`파일을 찾을 수 없습니다 (${response.status})`);
        }
        
        const content = await response.text();
        
        if (!content || content.trim() === '') {
            throw new Error('파일 내용이 비어있습니다');
        }
        
        // 캐시에 저장
        chapterDataCache.set(cacheKey, content);
        console.log('데이터 캐시 저장:', cacheKey);
        
        // 내용 표시
        displayChapterContent(content, chapter);
        
    } catch (error) {
        console.error('장 내용 로드 실패:', error);
        showErrorState(contentText, chapter, error.message);
    }
}

// 파일 경로 생성
function getChapterFilePath(book, chapter) {
    if (book === 'revelation') {
        return `data/Rev/R-chapter${chapter}.txt`;
    } else if (book === 'isaiah') {
        return `data/Isa/I-chapter${chapter}.txt`;
    }
    throw new Error('알 수 없는 책 이름: ' + book);
}

// 로딩 상태 표시
function showLoadingState(contentElement) {
    contentElement.innerHTML = `
        <div style="text-align: center; padding: 50px 20px;">
            <div class="loading-spinner"></div>
            <p style="color: #cccccc; margin-top: 20px; font-size: 16px;">강해 내용을 불러오는 중...</p>
        </div>
    `;
    
    // 스크롤을 맨 위로
    const scrollArea = document.querySelector('.content-scroll-area');
    if (scrollArea) {
        scrollArea.scrollTop = 0;
    }
}

// 에러 상태 표시
function showErrorState(contentElement, chapter, errorMessage) {
    let bookName = currentBook === 'revelation' ? '요한계시록' : '이사야';
    
    contentElement.innerHTML = `
        <div style="text-align: center; padding: 50px 20px;">
            <div style="font-size: 48px; margin-bottom: 20px;">📖</div>
            <h3 style="color: #ffdddd; margin-bottom: 15px;">${bookName} ${chapter}장</h3>
            <p style="color: #ffcccc; margin-bottom: 20px; line-height: 1.6;">
                강해 내용을 불러올 수 없습니다.<br>
                <small style="font-size: 14px; opacity: 0.8;">${errorMessage}</small>
            </p>
            <button onclick="retryLoadChapter()" style="
                background: rgba(255, 255, 255, 0.2);
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.3);
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
            ">다시 시도</button>
        </div>
    `;
    
    // 스크롤을 맨 위로
    const scrollArea = document.querySelector('.content-scroll-area');
    if (scrollArea) {
        scrollArea.scrollTop = 0;
    }
}

// 장 내용 표시
function displayChapterContent(content, chapter) {
    const contentText = document.getElementById('content-text');
    if (!contentText) {
        console.error('콘텐츠 텍스트 요소를 찾을 수 없습니다');
        return;
    }
    
    // 텍스트 내용 처리 (줄바꿈 보존, HTML 이스케이프)
    const processedContent = content
        .trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n/g, '\n')
        .replace(/\n\n+/g, '\n\n')
        .replace(/\n/g, '<br>');
    
    contentText.innerHTML = processedContent;
    
    // 스크롤을 맨 위로
    const scrollArea = document.querySelector('.content-scroll-area');
    if (scrollArea) {
        scrollArea.scrollTop = 0;
    }
    
    let bookName = currentBook === 'revelation' ? '요한계시록' : '이사야';
    console.log(`${bookName} ${chapter}장 내용 표시 완료`);
}

// 다시 시도 함수
function retryLoadChapter() {
    console.log('다시 시도 버튼 클릭');
    if (currentChapter) {
        loadChapterByNumber(currentChapter);
    }
}

// 뒤로가기 함수
function goBack() {
    // 메인 화면으로 슬라이드 (왼쪽에서 오른쪽으로)
    const currentScreen = document.querySelector('.screen.active');
    const mainScreen = document.getElementById('main-screen');
    
    if (currentScreen && mainScreen) {
        // 현재 화면을 오른쪽으로 슬라이드
        currentScreen.style.transform = 'translateX(100%)';
        
        setTimeout(() => {
            currentScreen.classList.remove('active');
            currentScreen.style.transform = '';
            mainScreen.classList.add('active');
        }, 400);
    }
    
    // 선택 초기화
    currentBook = '';
    currentChapter = '';
    const titleElement = document.getElementById('current-chapter-title');
    if (titleElement) {
        titleElement.textContent = '장을 선택하세요';
    }
    
    const contentElement = document.getElementById('content-text');
    if (contentElement) {
        contentElement.innerHTML = '<p style="text-align: center; color: #cccccc; font-size: 18px; margin-top: 50px;">여기에 강해 내용이 표시됩니다.</p>';
    }
    
    // 드롭다운 닫기
    closeChapterDropdown();
}

// 폰트 크기 증가
function increaseFontSize() {
    if (currentFontSize < maxFontSize) {
        currentFontSize += 2;
        updateFontSize();
        
        // 버튼 피드백
        animateButton(event.target);
        
        // 로컬 스토리지에 저장 (PWA에서는 사용 불가하지만 일반 브라우저용)
        try {
            localStorage.setItem('bible-font-size', currentFontSize);
        } catch (e) {
            // PWA 환경에서는 무시
        }
    }
}

// 폰트 크기 감소
function decreaseFontSize() {
    if (currentFontSize > minFontSize) {
        currentFontSize -= 2;
        updateFontSize();
        
        // 버튼 피드백
        animateButton(event.target);
        
        // 로컬 스토리지에 저장
        try {
            localStorage.setItem('bible-font-size', currentFontSize);
        } catch (e) {
            // PWA 환경에서는 무시
        }
    }
}

// 폰트 크기 업데이트
function updateFontSize() {
    const contentText = document.getElementById('content-text');
    if (contentText) {
        contentText.style.fontSize = currentFontSize + 'px';
    }
}

// 저장된 폰트 크기 로드
function loadSavedFontSize() {
    try {
        const savedSize = localStorage.getItem('bible-font-size');
        if (savedSize) {
            const size = parseInt(savedSize);
            if (size >= minFontSize && size <= maxFontSize) {
                currentFontSize = size;
                updateFontSize();
            }
        }
    } catch (e) {
        // PWA 환경에서는 기본값 사용
    }
}

// 버튼 애니메이션 효과
function animateButton(button) {
    if (!button) return;
    
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
        button.style.transform = '';
    }, 150);
}

// 캐시 관리 함수들
function clearCache() {
    chapterDataCache.clear();
    console.log('데이터 캐시 초기화');
}

function getCacheSize() {
    return chapterDataCache.size;
}

function getCacheInfo() {
    const cacheInfo = {
        size: chapterDataCache.size,
        keys: Array.from(chapterDataCache.keys())
    };
    console.log('캐시 정보:', cacheInfo);
    return cacheInfo;
}

// 프리로드 함수 (선택적)
async function preloadChapter(book, chapter) {
    const cacheKey = `${book}-${chapter}`;
    
    if (chapterDataCache.has(cacheKey)) {
        return; // 이미 캐시됨
    }
    
    try {
        const filePath = getChapterFilePath(book, chapter);
        const response = await fetch(filePath);
        
        if (response.ok) {
            const content = await response.text();
            chapterDataCache.set(cacheKey, content);
            console.log('프리로드 완료:', cacheKey);
        }
    } catch (error) {
        console.log('프리로드 실패:', cacheKey, error.message);
    }
}

// 인접 장 프리로드 (성능 최적화)
function preloadAdjacentChapters(book, currentChapter) {
    const chapter = parseInt(currentChapter);
    const maxChapter = book === 'revelation' ? 22 : 66;
    
    // 이전 장과 다음 장 프리로드
    if (chapter > 1) {
        preloadChapter(book, chapter - 1);
    }
    if (chapter < maxChapter) {
        preloadChapter(book, chapter + 1);
    }
}

// 외부 클릭 시 드롭다운 닫기
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('chapter-dropdown');
    const selectorBar = document.querySelector('.chapter-selector-bar');
    
    if (dropdown && selectorBar && !selectorBar.contains(event.target)) {
        closeChapterDropdown();
    }
});

// PWA 관련 함수들
// 설치 버튼 표시
function showInstallButton() {
    // 설치 버튼이 없으면 생성
    if (!installButton) {
        installButton = document.createElement('button');
        installButton.id = 'install-button';
        installButton.innerHTML = '📱 앱 설치';
        installButton.className = 'install-btn';
        installButton.onclick = installPWA;
        
        // 메인 화면에 설치 버튼 추가
        const mainScreen = document.getElementById('main-screen');
        if (mainScreen) {
            const versionSection = mainScreen.querySelector('.version-section');
            if (versionSection) {
                versionSection.appendChild(installButton);
            }
        }
    }
    
    installButton.style.display = 'block';
}

// 설치 버튼 숨기기
function hideInstallButton() {
    if (installButton) {
        installButton.style.display = 'none';
    }
}

// PWA 설치 실행
async function installPWA() {
    if (!deferredPrompt) {
        console.log('설치 프롬프트를 사용할 수 없습니다');
        return;
    }
    
    try {
        // 설치 프롬프트 표시
        deferredPrompt.prompt();
        
        // 사용자 응답 대기
        const { outcome } = await deferredPrompt.userChoice;
        console.log('사용자 선택:', outcome);
        
        if (outcome === 'accepted') {
            console.log('PWA 설치 승인됨');
        } else {
            console.log('PWA 설치 거부됨');
        }
    } catch (error) {
        console.error('PWA 설치 중 오류:', error);
    } finally {
        // 프롬프트 초기화
        deferredPrompt = null;
        hideInstallButton();
    }
}

// 업데이트 알림 표시
function showUpdateNotification() {
    // 기존 알림 제거
    const existingNotification = document.querySelector('.update-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const updateNotification = document.createElement('div');
    updateNotification.className = 'update-notification';
    updateNotification.innerHTML = `
        <div class="update-content">
            <span>🔄 새 버전이 사용 가능합니다</span>
            <button onclick="applyUpdate()">업데이트</button>
            <button onclick="dismissUpdate(this.parentElement.parentElement)">나중에</button>
        </div>
    `;
    
    document.body.appendChild(updateNotification);
    
    // 자동 제거 (15초 후)
    setTimeout(() => {
        if (updateNotification.parentElement) {
            updateNotification.remove();
        }
    }, 15000);
}

// 업데이트 적용
function applyUpdate() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
            }
        });
    }
}

// 업데이트 알림 닫기
function dismissUpdate(element) {
    if (element && element.parentElement) {
        element.remove();
    }
}

// 설치 완료 메시지
function showInstallSuccessMessage() {
    const successMessage = document.createElement('div');
    successMessage.className = 'install-success';
    successMessage.innerHTML = `
        <div class="success-content">
            <span>✅ 성경 강해집이 설치되었습니다!</span>
        </div>
    `;
    
    document.body.appendChild(successMessage);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        if (successMessage.parentElement) {
            successMessage.remove();
        }
    }, 3000);
}

// PWA 상태 확인
function isPWAInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
}

// 연결 상태 모니터링
function setupConnectionMonitoring() {
    function updateOnlineStatus() {
        const isOnline = navigator.onLine;
        console.log('연결 상태:', isOnline ? '온라인' : '오프라인');
        
        // 오프라인 상태 UI 업데이트
        if (!isOnline) {
            showOfflineIndicator();
        } else {
            hideOfflineIndicator();
        }
    }
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // 초기 상태 확인
    updateOnlineStatus();
}

// 오프라인 인디케이터 표시
function showOfflineIndicator() {
    let indicator = document.getElementById('offline-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.className = 'offline-indicator';
        indicator.innerHTML = '📡 오프라인 모드';
        document.body.appendChild(indicator);
    }
    indicator.style.display = 'block';
}

// 오프라인 인디케이터 숨기기
function hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// 캐시 상태 확인
async function getCacheStatus() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            const messageChannel = new MessageChannel();
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('캐시 상태 확인 타임아웃'));
                }, 5000);
                
                messageChannel.port1.onmessage = (event) => {
                    clearTimeout(timeout);
                    resolve(event.data);
                };
                
                if (registration.active) {
                    registration.active.postMessage(
                        { type: 'GET_VERSION' },
                        [messageChannel.port2]
                    );
                } else {
                    clearTimeout(timeout);
                    reject(new Error('활성 서비스 워커 없음'));
                }
            });
        } catch (error) {
            console.error('캐시 상태 확인 실패:', error);
            return null;
        }
    }
    return null;
}

// 터치 이벤트 처리 (모바일 최적화)
document.addEventListener('touchstart', function(e) {
    // 터치 시작 시 필요한 처리
}, { passive: true });

document.addEventListener('touchmove', function(e) {
    // 불필요한 스크롤 방지 (필요에 따라)
}, { passive: true });

// 화면 회전 감지
window.addEventListener('orientationchange', function() {
    // 화면 회전 시 레이아웃 재조정
    setTimeout(() => {
        // iOS 사파리 주소창 숨기기
        window.scrollTo(0, 1);
    }, 500);
});

// 키보드 이벤트 (접근성 향상)
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const currentScreen = document.querySelector('.screen.active');
        if (currentScreen && currentScreen.id === 'content-screen') {
            // 드롭다운이 열려있으면 먼저 닫기
            const dropdown = document.getElementById('chapter-dropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                closeChapterDropdown();
            } else {
                goBack();
            }
        }
    }
});

// 전역 에러 핸들링
window.addEventListener('error', function(e) {
    console.error('앱 에러:', e.error);
    
    // 사용자에게 에러 알림 (선택적)
    if (e.error && e.error.message) {
        console.error('상세 에러:', e.error.message);
    }
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('처리되지 않은 Promise 거부:', e.reason);
    e.preventDefault(); // 콘솔 에러 방지
});

// 페이지 가시성 변경 감지 (PWA 최적화)
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // 앱이 백그라운드로 갈 때
        console.log('앱이 백그라운드로 이동');
    } else {
        // 앱이 포그라운드로 올 때
        console.log('앱이 포그라운드로 이동');
        
        // 연결 상태 재확인
        if (navigator.onLine) {
            hideOfflineIndicator();
        } else {
            showOfflineIndicator();
        }
    }
});


// ============ 앱 종료 시 마지막 위치 저장/복원 ============

// 현재 위치 저장
function saveCurrentPosition() {
    if (currentBook && currentChapter) {
        const scrollArea = document.querySelector('.content-scroll-area');
        const scrollPosition = scrollArea ? scrollArea.scrollTop : 0;
        
        const lastPosition = {
            book: currentBook,
            chapter: currentChapter,
            scrollPosition: scrollPosition
        };
        
        try {
            localStorage.setItem('bible-last-app-position', JSON.stringify(lastPosition));
        } catch (e) {
            try {
                sessionStorage.setItem('bible-last-app-position', JSON.stringify(lastPosition));
            } catch (e2) {
                // 저장 불가능하면 무시
            }
        }
    }
}

// 앱 시작 시 마지막 위치로 복원
function restoreLastAppPosition() {
    try {
        let saved = localStorage.getItem('bible-last-app-position');
        if (!saved) {
            saved = sessionStorage.getItem('bible-last-app-position');
        }
        
        if (saved) {
            const lastPosition = JSON.parse(saved);
            
            if (lastPosition.book && lastPosition.chapter) {
                // 자동으로 마지막 위치로 이동
                setTimeout(() => {
                    selectBook(lastPosition.book);
                    setTimeout(() => {
                        selectChapter(lastPosition.chapter);
                        
                        // 스크롤 위치 복원
                        if (lastPosition.scrollPosition > 0) {
                            setTimeout(() => {
                                const scrollArea = document.querySelector('.content-scroll-area');
                                if (scrollArea) {
                                    scrollArea.scrollTop = lastPosition.scrollPosition;
                                }
                            }, 500);
                        }
                    }, 500);
                }, 500);
            }
        }
    } catch (e) {
        // 복원 실패시 무시
    }
}

// 앱 종료 시 현재 위치 저장
window.addEventListener('beforeunload', saveCurrentPosition);
window.addEventListener('pagehide', saveCurrentPosition);

// 페이지 가시성 변경 시에도 저장 (모바일 대응)
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        saveCurrentPosition();
    }
});

// 초기화 시 저장된 폰트 크기 로드
setTimeout(() => {
    loadSavedFontSize();
}, 100);
