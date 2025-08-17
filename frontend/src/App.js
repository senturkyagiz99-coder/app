import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { Label } from "./components/ui/label";
import { Separator } from "./components/ui/separator";
import { Users, MessageSquare, Calendar, Trophy, Vote, Plus, Lock, LogOut, User, Camera, Upload, Bell, BellOff, Wifi, WifiOff, Trash2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [debates, setDebates] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [selectedDebate, setSelectedDebate] = useState(null);
  const [comments, setComments] = useState([]);
  const [activeTab, setActiveTab] = useState('debates');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pushSubscription, setPushSubscription] = useState(null);
  
  // Forms state
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [debateForm, setDebateForm] = useState({
    title: '',
    description: '',
    topic: '',
    start_time: '',
    end_time: '',
    status: 'upcoming'
  });
  const [commentForm, setCommentForm] = useState({ content: '', author_name: '' });
  const [voteForm, setVoteForm] = useState({ voter_name: '' });
  const [joinForm, setJoinForm] = useState({ participant_name: '' });
  const [photoForm, setPhotoForm] = useState({
    title: '',
    description: '',
    event_date: '',
    file: null
  });

  // PWA ve çevrimdışı işlevsellik
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Bildirim izinlerini kontrol et
  useEffect(() => {
    if ('Notification' in window) {
      const permission = Notification.permission;
      setNotificationsEnabled(permission === 'granted');
    }
  }, []);

  // Check for Google OAuth callback on page load
  useEffect(() => {
    const urlFragment = window.location.hash;
    if (urlFragment.includes('session_id=')) {
      const sessionId = urlFragment.split('session_id=')[1];
      handleGoogleCallback(sessionId);
    }
  }, []);

  useEffect(() => {
    if (token) {
      setIsAdmin(true);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    fetchDebates();
    fetchPhotos();
    checkUserAuth();
  }, [token]);

  // Push bildirimleri için service worker'ı kaydet
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      registerServiceWorker();
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker kaydedildi:', registration);
    } catch (error) {
      console.error('Service Worker kayıt hatası:', error);
    }
  };

  const checkUserAuth = async () => {
    try {
      const response = await axios.get(`${API}/auth/profile`, { withCredentials: true });
      setUser(response.data);
    } catch (error) {
      // User not authenticated
      setUser(null);
    }
  };

  const handleGoogleLogin = () => {
    const currentUrl = window.location.origin;
    const redirectUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(currentUrl + '/profile')}`;
    window.location.href = redirectUrl;
  };

  const handleGoogleCallback = async (sessionId) => {
    try {
      const response = await axios.post(`${API}/auth/callback?session_id=${sessionId}`, {}, { withCredentials: true });
      setUser(response.data.user);
      // Clear the URL fragment
      window.history.replaceState({}, document.title, window.location.pathname);
      alert('Google ile giriş başarılı!');
    } catch (error) {
      console.error('Google callback error:', error);
      alert('Google girişinde hata oluştu');
    }
  };

  const handleLogoutUser = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('Bu tarayıcı bildirimleri desteklemiyor');
      return;
    }

    if (Notification.permission === 'granted') {
      await subscribeToNotifications();
      return;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        await subscribeToNotifications();
        alert('Bildirimler başarıyla etkinleştirildi!');
      } else {
        alert('Bildirimler reddedildi. Tarayıcı ayarlarından etkinleştirebilirsiniz.');
      }
    } else {
      alert('Bildirimler engellenmiş. Tarayıcı ayarlarından etkinleştirin.');
    }
  };

  const subscribeToNotifications = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array('BEl62iUYgUivxIkv69yViEuiBIa40HI0DLb5g7OBzpGbk4YD5BtMbYeJ8EeNz2K1-hGWJMF4B3P2B5AY2QKYzgc')
      });

      // Backend'e abonelik bilgisini gönder
      await axios.post(`${API}/notifications/subscribe`, {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth'))))
        }
      });

      setPushSubscription(subscription);
      setNotificationsEnabled(true);
    } catch (error) {
      console.error('Bildirim aboneliği hatası:', error);
    }
  };

  const unsubscribeFromNotifications = async () => {
    try {
      if (pushSubscription) {
        await pushSubscription.unsubscribe();
        await axios.delete(`${API}/notifications/unsubscribe/${encodeURIComponent(pushSubscription.endpoint)}`);
        setPushSubscription(null);
      }
      setNotificationsEnabled(false);
      alert('Bildirimler kapatıldı');
    } catch (error) {
      console.error('Bildirim aboneliği iptal hatası:', error);
    }
  };

  // VAPID key converter
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const fetchDebates = async () => {
    try {
      const response = await axios.get(`${API}/debates`);
      setDebates(response.data);
      // Çevrimdışı kullanım için önbelleğe al
      localStorage.setItem('debates', JSON.stringify(response.data));
    } catch (error) {
      console.error('Münazaralar yüklenirken hata:', error);
      // Çevrimdışıysa yerel depolamadan yükle
      if (!isOnline) {
        const cachedDebates = localStorage.getItem('debates');
        if (cachedDebates) {
          setDebates(JSON.parse(cachedDebates));
        }
      }
    }
  };

  const fetchPhotos = async () => {
    try {
      const response = await axios.get(`${API}/photos`);
      setPhotos(response.data);
      // Çevrimdışı kullanım için fotoğrafları önbelleğe al
      localStorage.setItem('photos', JSON.stringify(response.data));
    } catch (error) {
      console.error('Fotoğraflar yüklenirken hata:', error);
      // Çevrimdışıysa yerel depolamadan yükle
      if (!isOnline) {
        const cachedPhotos = localStorage.getItem('photos');
        if (cachedPhotos) {
          setPhotos(JSON.parse(cachedPhotos));
        }
      }
    }
  };

  const fetchComments = async (debateId) => {
    try {
      const response = await axios.get(`${API}/comments/${debateId}`);
      setComments(response.data);
    } catch (error) {
      console.error('Yorumlar yüklenirken hata:', error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API}/admin/login`, loginForm);
      const { access_token } = response.data;
      setToken(access_token);
      localStorage.setItem('adminToken', access_token);
      setIsAdmin(true);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setLoginForm({ username: '', password: '' });
    } catch (error) {
      alert('Geçersiz kimlik bilgileri');
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('adminToken');
    setIsAdmin(false);
    delete axios.defaults.headers.common['Authorization'];
  };

  const handleCreateDebate = async (e) => {
    e.preventDefault();
    if (!isOnline) {
      alert('Münazara oluşturmak için çevrimiçi olmanız gerekir');
      return;
    }
    try {
      await axios.post(`${API}/debates`, debateForm);
      setDebateForm({
        title: '',
        description: '',
        topic: '',
        start_time: '',
        end_time: '',
        status: 'upcoming'
      });
      fetchDebates();
      alert('Münazara başarıyla oluşturuldu!');
    } catch (error) {
      alert('Münazara oluşturulurken hata');
    }
  };

  const handleDeleteDebate = async (debateId) => {
    if (!confirm('Bu münazarayı silmek istediğinizden emin misiniz?')) return;
    if (!isOnline) {
      alert('Münazara silmek için çevrimiçi olmanız gerekir');
      return;
    }
    try {
      await axios.delete(`${API}/debates/${debateId}`);
      fetchDebates();
      alert('Münazara başarıyla silindi!');
    } catch (error) {
      alert('Münazara silinirken hata');
    }
  };

  const handleVote = async (debateId, voteType) => {
    if (!voteForm.voter_name.trim()) {
      alert('Oy vermek için lütfen adınızı girin');
      return;
    }
    if (!isOnline) {
      alert('Oy vermek için çevrimiçi olmanız gerekir');
      return;
    }
    try {
      await axios.post(`${API}/debates/vote`, {
        debate_id: debateId,
        vote_type: voteType,
        voter_name: voteForm.voter_name
      });
      setVoteForm({ voter_name: '' });
      fetchDebates();
      alert('Oyunuz başarıyla kaydedildi!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Oy verirken hata');
    }
  };

  const handleJoinDebate = async (debateId) => {
    if (!joinForm.participant_name.trim()) {
      alert('Katılmak için lütfen adınızı girin');
      return;
    }
    if (!isOnline) {
      alert('Münazaraya katılmak için çevrimiçi olmanız gerekir');
      return;
    }
    try {
      await axios.post(`${API}/debates/join`, {
        debate_id: debateId,
        participant_name: joinForm.participant_name
      });
      setJoinForm({ participant_name: '' });
      fetchDebates();
      alert('Münazaraya başarıyla katıldınız!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Münazaraya katılırken hata');
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentForm.author_name.trim() || !commentForm.content.trim()) {
      alert('Lütfen tüm yorum alanlarını doldurun');
      return;
    }
    if (!isOnline) {
      alert('Yorum yapmak için çevrimiçi olmanız gerekir');
      return;
    }
    try {
      await axios.post(`${API}/comments`, {
        debate_id: selectedDebate.id,
        content: commentForm.content,
        author_name: commentForm.author_name
      });
      setCommentForm({ content: '', author_name: '' });
      fetchComments(selectedDebate.id);
    } catch (error) {
      alert('Yorum gönderirken hata');
    }
  };

  const handlePhotoUpload = async (e) => {
    e.preventDefault();
    if (!photoForm.file || !photoForm.title.trim()) {
      alert('Lütfen bir dosya seçin ve başlık girin');
      return;
    }
    if (!isOnline) {
      alert('Fotoğraf yüklemek için çevrimiçi olmanız gerekir');
      return;
    }

    const formData = new FormData();
    formData.append('file', photoForm.file);
    formData.append('title', photoForm.title);
    formData.append('description', photoForm.description);
    formData.append('event_date', photoForm.event_date);

    try {
      await axios.post(`${API}/photos/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setPhotoForm({
        title: '',
        description: '',
        event_date: '',
        file: null
      });
      // Dosya input'unu sıfırla
      document.getElementById('photo-upload').value = '';
      fetchPhotos();
      alert('Fotoğraf başarıyla yüklendi!');
    } catch (error) {
      alert('Fotoğraf yüklenirken hata');
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!confirm('Bu fotoğrafı silmek istediğinizden emin misiniz?')) return;
    if (!isOnline) {
      alert('Fotoğraf silmek için çevrimiçi olmanız gerekir');
      return;
    }
    
    try {
      await axios.delete(`${API}/photos/${photoId}`);
      fetchPhotos();
      alert('Fotoğraf başarıyla silindi!');
    } catch (error) {
      alert('Fotoğraf silinirken hata');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('tr-TR');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'upcoming': return 'bg-blue-500';
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'upcoming': return 'Yaklaşan';
      case 'active': return 'Aktif';
      case 'completed': return 'Tamamlandı';
      default: return 'Bilinmiyor';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-lg border-b-4 border-red-600">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-red-600 p-2 rounded-full">
                <Trophy className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-red-700">Münazara Kulübü</h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Çevrimdışı/Çevrimiçi Durumu */}
              <div className="flex items-center space-x-2">
                {isOnline ? (
                  <div className="flex items-center text-green-600">
                    <Wifi className="h-4 w-4 mr-1" />
                    <span className="text-xs">Çevrimiçi</span>
                  </div>
                ) : (
                  <div className="flex items-center text-red-600">
                    <WifiOff className="h-4 w-4 mr-1" />
                    <span className="text-xs">Çevrimdışı</span>
                  </div>
                )}
              </div>

              {/* Bildirim Durumu */}
              <div className="flex items-center space-x-2">
                <Button
                  onClick={notificationsEnabled ? unsubscribeFromNotifications : requestNotificationPermission}
                  variant="outline"
                  size="sm"
                  className={`${notificationsEnabled ? 'border-green-300 text-green-700 hover:bg-green-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  {notificationsEnabled ? (
                    <>
                      <Bell className="h-4 w-4 mr-1" />
                      <span className="text-xs">Bildirimler Açık</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="h-4 w-4 mr-1" />
                      <span className="text-xs">Bildirimleri Aç</span>
                    </>
                  )}
                </Button>
              </div>

              {/* User Authentication */}
              {user ? (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    {user.picture && (
                      <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
                    )}
                    <span className="text-sm font-medium text-gray-700">{user.name}</span>
                  </div>
                  <Button 
                    onClick={handleLogoutUser}
                    variant="outline" 
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Çıkış
                  </Button>
                </div>
              ) : (
                <Button onClick={handleGoogleLogin} className="bg-blue-600 hover:bg-blue-700">
                  Google ile Giriş Yap
                </Button>
              )}
              
              {/* Admin Panel */}
              {isAdmin ? (
                <div className="flex items-center space-x-3">
                  <Badge variant="secondary" className="bg-red-100 text-red-700">
                    <User className="h-3 w-3 mr-1" />
                    Yönetici
                  </Badge>
                  <Button 
                    onClick={handleLogout}
                    variant="outline" 
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Admin Çıkış
                  </Button>
                </div>
              ) : (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="bg-red-600 hover:bg-red-700">
                      <Lock className="h-4 w-4 mr-2" />
                      Yönetici Girişi
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-red-700">Yönetici Girişi</DialogTitle>
                      <DialogDescription>
                        Yönetici özelliklerine erişmek için kimlik bilgilerinizi girin
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <Label htmlFor="username">Kullanıcı Adı</Label>
                        <Input
                          id="username"
                          value={loginForm.username}
                          onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                          placeholder="debateclub2025"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="password">Şifre</Label>
                        <Input
                          id="password"
                          type="password"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                          placeholder="••••••••••••"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">
                        Giriş Yap
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 bg-white border border-red-200">
            <TabsTrigger value="debates" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Trophy className="h-4 w-4 mr-2" />
              Münazaralar
            </TabsTrigger>
            <TabsTrigger value="schedule" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Calendar className="h-4 w-4 mr-2" />
              Program
            </TabsTrigger>
            <TabsTrigger value="photos" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Camera className="h-4 w-4 mr-2" />
              Fotoğraflar
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="admin" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Oluştur
                </TabsTrigger>
                <TabsTrigger value="admin-photos" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                  <Upload className="h-4 w-4 mr-2" />
                  Yükle
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Münazaralar Sekmesi */}
          <TabsContent value="debates" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {debates.map((debate) => (
                <Card key={debate.id} className="border-red-200 hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge className={`${getStatusColor(debate.status)} text-white`}>
                        {getStatusText(debate.status)}
                      </Badge>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1 text-sm text-gray-500">
                          <Users className="h-4 w-4" />
                          <span>{debate.participants?.length || 0}</span>
                        </div>
                        {/* Admin silme butonu */}
                        {isAdmin && (
                          <Button
                            onClick={() => handleDeleteDebate(debate.id)}
                            variant="outline"
                            size="sm"
                            className="border-red-300 text-red-700 hover:bg-red-50 p-1 h-6 w-6"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <CardTitle className="text-red-700">{debate.title}</CardTitle>
                    <CardDescription>{debate.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-gray-600">
                      <strong>Konu:</strong> {debate.topic}
                    </div>
                    <div className="text-sm text-gray-600">
                      <strong>Tarih:</strong> {formatDate(debate.start_time)}
                    </div>
                    
                    {/* Oylama Bölümü */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-4">
                          <div className="text-center">
                            <div className="text-lg font-bold text-green-600">{debate.votes_for}</div>
                            <div className="text-xs text-gray-500">Lehinde</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-red-600">{debate.votes_against}</div>
                            <div className="text-xs text-gray-500">Aleyhinde</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Input
                          placeholder="Oy vermek için adınız"
                          value={voteForm.voter_name}
                          onChange={(e) => setVoteForm({voter_name: e.target.value})}
                          className="text-sm"
                        />
                        <div className="flex space-x-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleVote(debate.id, 'for')}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            <Vote className="h-3 w-3 mr-1" />
                            Lehinde Oy Ver
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => handleVote(debate.id, 'against')}
                            className="flex-1 bg-red-600 hover:bg-red-700"
                          >
                            <Vote className="h-3 w-3 mr-1" />
                            Aleyhinde Oy Ver
                          </Button>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Münazaraya Katıl */}
                    <div className="space-y-2">
                      <Input
                        placeholder="Münazaraya katılmak için adınız"
                        value={joinForm.participant_name}
                        onChange={(e) => setJoinForm({participant_name: e.target.value})}
                        className="text-sm"
                      />
                      <Button 
                        size="sm" 
                        onClick={() => handleJoinDebate(debate.id)}
                        variant="outline"
                        className="w-full border-red-300 text-red-700 hover:bg-red-50"
                      >
                        <Users className="h-3 w-3 mr-1" />
                        Münazaraya Katıl
                      </Button>
                    </div>

                    {/* Yorumlar */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="w-full border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setSelectedDebate(debate);
                            fetchComments(debate.id);
                          }}
                        >
                          <MessageSquare className="h-3 w-3 mr-1" />
                          Yorumları Görüntüle
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="text-red-700">Münazara: {debate.title}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <form onSubmit={handleComment} className="space-y-3">
                            <Input
                              placeholder="Adınız"
                              value={commentForm.author_name}
                              onChange={(e) => setCommentForm({...commentForm, author_name: e.target.value})}
                              required
                            />
                            <Textarea
                              placeholder="Bu münazara hakkındaki düşüncelerinizi paylaşın..."
                              value={commentForm.content}
                              onChange={(e) => setCommentForm({...commentForm, content: e.target.value})}
                              required
                            />
                            <Button type="submit" className="bg-red-600 hover:bg-red-700">
                              Yorum Gönder
                            </Button>
                          </form>
                          <Separator />
                          <div className="space-y-3">
                            {comments.map((comment) => (
                              <div key={comment.id} className="border-l-4 border-red-200 pl-4 py-2">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-semibold text-red-700">{comment.author_name}</span>
                                  <span className="text-xs text-gray-500">{formatDate(comment.created_at)}</span>
                                </div>
                                <p className="text-gray-700">{comment.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Program Sekmesi */}
          <TabsContent value="schedule">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-700 flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Münazara Programı
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {debates
                    .filter(d => d.status !== 'completed')
                    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
                    .map((debate) => (
                    <div key={debate.id} className="flex items-center justify-between p-4 border border-red-200 rounded-lg">
                      <div>
                        <h3 className="font-semibold text-red-700">{debate.title}</h3>
                        <p className="text-sm text-gray-600">{debate.topic}</p>
                        <p className="text-xs text-gray-500">{formatDate(debate.start_time)}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className={`${getStatusColor(debate.status)} text-white`}>
                          {getStatusText(debate.status)}
                        </Badge>
                        {isAdmin && (
                          <Button
                            onClick={() => handleDeleteDebate(debate.id)}
                            variant="outline"
                            size="sm"
                            className="border-red-300 text-red-700 hover:bg-red-50 p-1 h-6 w-6"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fotoğraflar Sekmesi */}
          <TabsContent value="photos">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-700 flex items-center">
                  <Camera className="h-5 w-5 mr-2" />
                  Etkinlik Fotoğrafları
                </CardTitle>
                <CardDescription>
                  Geçmiş münazaralar ve kulüp etkinliklerinden fotoğraflar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {photos.map((photo) => (
                    <Card key={photo.id} className="border-red-200 overflow-hidden">
                      <div className="aspect-video bg-gray-200 flex items-center justify-center">
                        <Camera className="h-12 w-12 text-gray-400" />
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-red-700 mb-2">{photo.title}</h3>
                        <p className="text-sm text-gray-600 mb-2">{photo.description}</p>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{formatDate(photo.event_date)}</span>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeletePhoto(photo.id)}
                              className="border-red-300 text-red-700 hover:bg-red-50"
                            >
                              Sil
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Yönetici Münazara Oluştur Sekmesi */}
          {isAdmin && (
            <TabsContent value="admin">
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-700 flex items-center">
                    <Plus className="h-5 w-5 mr-2" />
                    Yeni Münazara Oluştur
                  </CardTitle>
                  <CardDescription>
                    Kulüp için münazara konularını planlayın ve yönetin
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateDebate} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="title">Münazara Başlığı</Label>
                        <Input
                          id="title"
                          value={debateForm.title}
                          onChange={(e) => setDebateForm({...debateForm, title: e.target.value})}
                          placeholder="Münazara başlığını girin"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="topic">Konu</Label>
                        <Input
                          id="topic"
                          value={debateForm.topic}
                          onChange={(e) => setDebateForm({...debateForm, topic: e.target.value})}
                          placeholder="Ana münazara konusu"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="description">Açıklama</Label>
                      <Textarea
                        id="description"
                        value={debateForm.description}
                        onChange={(e) => setDebateForm({...debateForm, description: e.target.value})}
                        placeholder="Münazaranın detaylı açıklaması"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="start_time">Başlangıç Saati</Label>
                        <Input
                          id="start_time"
                          type="datetime-local"
                          value={debateForm.start_time}
                          onChange={(e) => setDebateForm({...debateForm, start_time: e.target.value})}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="end_time">Bitiş Saati</Label>
                        <Input
                          id="end_time"
                          type="datetime-local"
                          value={debateForm.end_time}
                          onChange={(e) => setDebateForm({...debateForm, end_time: e.target.value})}
                          required
                        />
                      </div>
                    </div>
                    <Button type="submit" className="bg-red-600 hover:bg-red-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Münazara Oluştur
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Yönetici Fotoğraf Yükle Sekmesi */}
          {isAdmin && (
            <TabsContent value="admin-photos">
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-700 flex items-center">
                    <Upload className="h-5 w-5 mr-2" />
                    Etkinlik Fotoğrafları Yükle
                  </CardTitle>
                  <CardDescription>
                    Münazaralar ve kulüp etkinliklerinden fotoğraf ekleyin
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePhotoUpload} className="space-y-4">
                    <div>
                      <Label htmlFor="photo-upload">Fotoğraf Dosyası</Label>
                      <Input
                        id="photo-upload"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPhotoForm({...photoForm, file: e.target.files[0]})}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="photo-title">Fotoğraf Başlığı</Label>
                        <Input
                          id="photo-title"
                          value={photoForm.title}
                          onChange={(e) => setPhotoForm({...photoForm, title: e.target.value})}
                          placeholder="Fotoğraf başlığını girin"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="event-date">Etkinlik Tarihi</Label>
                        <Input
                          id="event-date"
                          type="date"
                          value={photoForm.event_date}
                          onChange={(e) => setPhotoForm({...photoForm, event_date: e.target.value})}
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="photo-description">Açıklama</Label>
                      <Textarea
                        id="photo-description"
                        value={photoForm.description}
                        onChange={(e) => setPhotoForm({...photoForm, description: e.target.value})}
                        placeholder="Etkinlik veya fotoğraf bağlamını açıklayın"
                      />
                    </div>
                    <Button type="submit" className="bg-red-600 hover:bg-red-700">
                      <Upload className="h-4 w-4 mr-2" />
                      Fotoğraf Yükle
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="bg-red-700 text-white py-8 mt-12">
        <div className="container mx-auto px-6 text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Trophy className="h-6 w-6" />
            <span className="text-xl font-bold">Münazara Kulübü</span>
          </div>
          <p className="text-red-200">
            2025'ten beri eleştirel düşünme ve etkili söylemi teşvik ediyoruz
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;