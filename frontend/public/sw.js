// Tartışma Kulübü PWA için Service Worker
const CACHE_NAME = 'tartisma-kulubu-v1';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Install olayı - kaynakları önbelleğe al
self.addEventListener('install', (event) => {
  console.log('Service Worker: Yükleme olayı');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Dosyalar önbelleğe alınıyor');
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })));
      })
      .catch((error) => {
        console.log('Service Worker: Önbellek başarısız', error);
      })
  );
});

// Activate olayı - eski önbellekleri temizle
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Aktivasyon olayı');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Eski önbellek siliniyor', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch olayı - önbellekten sun, ağa geri dön
self.addEventListener('fetch', (event) => {
  // Çapraz köken isteklerini atla
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // API isteklerini gerçek zamanlı veri için atla
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Önbelleğe alınmış sürümü döndür veya ağdan getir
        return response || fetch(event.request).then((fetchResponse) => {
          // Geçerli bir yanıt aldığımızı kontrol et
          if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
            return fetchResponse;
          }

          // Yanıtı klonla çünkü sadece bir kez tüketilebilir
          const responseToCache = fetchResponse.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return fetchResponse;
        });
      })
      .catch(() => {
        // Navigasyon istekleri için çevrimdışı sayfasını döndür
        if (event.request.destination === 'document') {
          return caches.match('/');
        }
      })
  );
});

// Arka plan senkronizasyonu
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Arka plan senkronizasyonu', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      console.log('Arka plan senkronizasyonu gerçekleştiriliyor...')
    );
  }
});

// Push bildirimleri
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push bildirimi alındı');
  
  let notificationData = {
    title: 'Tartışma Kulübü',
    body: 'Yeni tartışma aktivitesi!',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png'
  };

  // Push verisi varsa parse et
  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = {
        ...notificationData,
        ...pushData
      };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
      url: notificationData.url || '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Tartışmaları Görüntüle',
        icon: '/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Kapat',
        icon: '/icon-192x192.png'
      }
    ],
    tag: 'tartisma-kulubu-notification',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// Bildirim tıklama işleyicisi
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Bildirim tıklandı');
  
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          // Zaten açık bir pencere var mı kontrol et
          for (let client of clients) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Yeni pencere aç
          if (self.clients.openWindow) {
            return self.clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

// Bildirim kapatma işleyicisi
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: Bildirim kapatıldı');
});