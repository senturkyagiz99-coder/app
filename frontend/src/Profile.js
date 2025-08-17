import React, { useEffect } from 'react';

const Profile = () => {
  useEffect(() => {
    // Check for session_id in URL fragment
    const urlFragment = window.location.hash;
    if (urlFragment.includes('session_id=')) {
      const sessionId = urlFragment.split('session_id=')[1];
      // Redirect back to main app with session_id
      window.location.href = `/#session_id=${sessionId}`;
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-700 mb-4">Giriş yapılıyor...</h1>
        <p className="text-gray-600">Lütfen bekleyiniz, ana sayfaya yönlendiriliyorsunuz.</p>
      </div>
    </div>
  );
};

export default Profile;