// 서비스 워커 - 성경 강해집 PWA
const CACHE_NAME = 'bible-study-v2.1.0';
const CACHE_VERSION = '2.1.0';
const BASE_PATH = '/bible-study';

// 앱 셸 캐싱 파일들
const APP_SHELL_FILES = [
    BASE_PATH + '/',
    BASE_PATH + '/index.html',
    BASE_PATH + '/style.css',
    BASE_PATH + '/app.js',
    BASE_PATH + '/manifest.json'
];

// 이미지 파일들 (버튼 이미지 제거)
const IMAGE_FILES = [
    BASE_PATH + '/main-logo.png',
    BASE_PATH + '/icon-192a.png',
    BASE_PATH + '/icon-512a.png'
];

// 데이터 파일들 (동적으로 생성)
const getDataFiles = () => {
    const files = [];
    
    // 요한계시록 1-22장
    for (let i = 1; i <= 22; i++) {
        files.push(`${BASE_PATH}/data/Rev/R-chapter${i}.txt`);
    }
    
    // 이사야 1-66장
    for (let i = 1; i <= 66; i++) {
        files.push(`${BASE_PATH}/data/Isa/I-chapter${i}.txt`);
    }
    
    return files;
};

// 전체 캐시할 파일 목록
const ALL_CACHE_FILES = [
    ...APP_SHELL_FILES,
    ...IMAGE_FILES,
    ...getDataFiles()
];

// 서비스 워커 설치
self.addEventListener('install', function(event) {
    console.log(`[SW] 서비스 워커 설치 중... (v${CACHE_VERSION})`);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async function(cache) {
                console.log('[SW] 캐시 열기 성공');
                
                // 앱 셸 파일들 우선 캐시
                try {
                    await cache.addAll(APP_SHELL_FILES);
                    console.log('[SW] 앱 셸 파일 캐시 완료');
                } catch (error) {
                    console.error('[SW] 앱 셸 캐시 실패:', error);
                }
                
                // 이미지 파일들 캐시
                try {
                    await cache.addAll(IMAGE_FILES);
                    console.log('[SW] 이미지 파일 캐시 완료');
                } catch (error) {
                    console.log('[SW] 일부 이미지 파일 캐시 실패 (정상):', error.message);
                }
                
                // 데이터 파일들 개별적으로 캐시 (실패해도 계속 진행)
                const dataFiles = getDataFiles();
                let successCount = 0;
                
                for (const file of dataFiles) {
                    try {
                        const response = await fetch(file);
                        if (response.ok) {
                            await cache.put(file, response);
                            successCount++;
                        }
                    } catch (error) {
                        console.log(`[SW] 데이터 파일 캐시 건너뛰기: ${file}`);
                    }
                }
                
                console.log(`[SW] 데이터 파일 ${successCount}/${dataFiles.length}개 캐시 완료`);
                
                // 즉시 활성화
                return self.skipWaiting();
            })
            .catch(function(error) {
                console.error('[SW] 캐시 실패:', error);
            })
    );
});

// 서비스 워커 활성화
self.addEventListener('activate', function(event) {
    console.log('[SW] 서비스 워커 활성화 중...');
    
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    // 이전 버전의 캐시 삭제
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] 이전 캐시 삭제:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(function() {
            console.log('[SW] 서비스 워커 활성화 완료');
            // 모든 클라이언트를 즉시 제어
            return self.clients.claim();
        })
    );
});

// 네트워크 요청 가로채기 (Cache First 전략)
self.addEventListener('fetch', function(event) {
    // GET 요청만 처리
    if (event.request.method !== 'GET') {
        return;
    }
    
    // 외부 리소스는 무시
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(function(cachedResponse) {
                // 캐시에서 찾은 경우 즉시 반환
                if (cachedResponse) {
                    console.log('[SW] 캐시에서 제공:', event.request.url);
                    
                    // 백그라운드에서 캐시 업데이트 (stale-while-revalidate)
                    if (isAppShellFile(event.request.url)) {
                        updateCacheInBackground(event.request);
                    }
                    
                    return cachedResponse;
                }
                
                console.log('[SW] 네트워크에서 가져오기:', event.request.url);
                
                // 네트워크에서 가져오기
                return fetch(event.request)
                    .then(function(networkResponse) {
                        // 유효한 응답인지 확인
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }
                        
                        // 응답 복사 (스트림은 한 번만 사용 가능하므로)
                        const responseToCache = networkResponse.clone();
                        
                        // 캐시에 추가
                        caches.open(CACHE_NAME)
                            .then(function(cache) {
                                cache.put(event.request, responseToCache);
                                console.log('[SW] 새 파일 캐시 저장:', event.request.url);
                            });
                        
                        return networkResponse;
                    })
                    .catch(function(error) {
                        console.error('[SW] 네트워크 요청 실패:', error);
                        
                        // 오프라인 시 폴백 제공
                        return getOfflineFallback(event.request);
                    });
            })
    );
});

// 앱 셸 파일 확인
function isAppShellFile(url) {
    return APP_SHELL_FILES.some(file => url.endsWith(file) || url.includes(file));
}

// 백그라운드 캐시 업데이트
async function updateCacheInBackground(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response);
            console.log('[SW] 백그라운드 캐시 업데이트:', request.url);
        }
    } catch (error) {
        console.log('[SW] 백그라운드 업데이트 실패:', error.message);
    }
}

// 오프라인 폴백
function getOfflineFallback(request) {
    // HTML 요청의 경우 메인 페이지 반환
    if (request.destination === 'document') {
        return caches.match(BASE_PATH + '/index.html');
    }
    
    // 텍스트 파일의 경우 오프라인 메시지 반환
    if (request.url.includes('.txt')) {
        return new Response(
            '오프라인 상태입니다.\n인터넷 연결을 확인한 후 다시 시도해주세요.',
            {
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            }
        );
    }
    
    // 이미지의 경우 기본 이미지나 오류 반환
    if (request.destination === 'image') {
        return new Response('', { status: 404 });
    }
    
    // 기타 리소스의 경우 오류 반환
    return new Response('오프라인 상태입니다.', { 
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}

// 백그라운드 동기화
self.addEventListener('sync', function(event) {
    if (event.tag === 'background-sync') {
        console.log('[SW] 백그라운드 동기화 실행');
        event.waitUntil(doBackgroundSync());
    }
});

// 푸시 알림 처리
self.addEventListener('push', function(event) {
    console.log('[SW] 푸시 메시지 수신:', event);
    
    const title = '성경 강해집';
    const options = {
        body: event.data ? event.data.text() : '새로운 강해 내용이 업데이트되었습니다.',
        icon: BASE_PATH + '/icon-192a.png',
        badge: BASE_PATH + '/icon-192a.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 'push-notification'
        },
        actions: [
            {
                action: 'explore',
                title: '확인하기',
                icon: BASE_PATH + '/icon-192a.png'
            },
            {
                action: 'close',
                title: '닫기'
            }
        ],
        requireInteraction: false,
        silent: false
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] 알림 클릭됨:', event);
    event.notification.close();
    
    if (event.action === 'explore') {
        // 앱 열기 또는 포커스
        event.waitUntil(
            clients.matchAll({ type: 'window' })
                .then(function(clientList) {
                    if (clientList.length > 0) {
                        return clientList[0].focus();
                    } else {
                        return clients.openWindow(BASE_PATH + '/');
                    }
                })
        );
    }
});

// 백그라운드 동기화 함수
async function doBackgroundSync() {
    try {
        console.log('[SW] 백그라운드 동기화 시작');
        
        // 중요한 파일들 캐시 업데이트
        const cache = await caches.open(CACHE_NAME);
        
        for (const file of APP_SHELL_FILES) {
            try {
                const response = await fetch(file);
                if (response.ok) {
                    await cache.put(file, response);
                }
            } catch (error) {
                console.log(`[SW] 동기화 실패: ${file}`);
            }
        }
        
        console.log('[SW] 백그라운드 동기화 완료');
        return Promise.resolve();
    } catch (error) {
        console.error('[SW] 백그라운드 동기화 실패:', error);
        return Promise.reject(error);
    }
}

// 캐시 크기 관리
async function cleanupCache() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const requests = await cache.keys();
        
        // 캐시 항목이 너무 많으면 오래된 데이터 파일부터 삭제
        if (requests.length > 150) { // 88개 데이터파일 + 기타 파일들
            const dataRequests = requests.filter(req => req.url.includes('.txt'));
            const oldRequests = dataRequests.slice(0, dataRequests.length - 80); // 최신 80개만 유지
            
            await Promise.all(
                oldRequests.map(request => cache.delete(request))
            );
            
            console.log(`[SW] 캐시 정리 완료: ${oldRequests.length}개 파일 삭제`);
        }
    } catch (error) {
        console.error('[SW] 캐시 정리 실패:', error);
    }
}

// 주기적 캐시 정리 (24시간마다)
setInterval(cleanupCache, 24 * 60 * 60 * 1000);

// 메시지 처리
self.addEventListener('message', function(event) {
    console.log('[SW] 메시지 수신:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_UPDATE') {
        // 캐시 강제 업데이트
        event.waitUntil(
            caches.open(CACHE_NAME).then(cache => {
                return cache.addAll(APP_SHELL_FILES);
            })
        );
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        // 버전 정보 반환
        event.ports[0].postMessage({
            version: CACHE_VERSION,
            cacheSize: ALL_CACHE_FILES.length
        });
    }
});

// 에러 처리
self.addEventListener('error', function(event) {
    console.error('[SW] 서비스 워커 에러:', event.error);
});

self.addEventListener('unhandledrejection', function(event) {
    console.error('[SW] 서비스 워커 Promise 거부:', event.reason);
});

console.log(`[SW] 서비스 워커 스크립트 로드 완료 (v${CACHE_VERSION})`);
