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
import { Users, MessageSquare, Calendar, Trophy, Vote, Plus, Lock, LogOut, User, Camera, CreditCard, Upload, DollarSign, Image, Receipt } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [debates, setDebates] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [paymentPackages, setPaymentPackages] = useState({});
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [selectedDebate, setSelectedDebate] = useState(null);
  const [comments, setComments] = useState([]);
  const [activeTab, setActiveTab] = useState('debates');
  
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
  const [paymentForm, setPaymentForm] = useState({
    payment_type: 'membership_monthly',
    member_name: '',
    amount: 0,
    debate_id: ''
  });

  useEffect(() => {
    if (token) {
      setIsAdmin(true);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    fetchDebates();
    fetchPhotos();
    fetchPaymentPackages();
    if (isAdmin) {
      fetchPaymentTransactions();
    }
  }, [token, isAdmin]);

  // Check for payment success/cancel in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    if (sessionId) {
      pollPaymentStatus(sessionId);
    }
  }, []);

  const fetchDebates = async () => {
    try {
      const response = await axios.get(`${API}/debates`);
      setDebates(response.data);
    } catch (error) {
      console.error('Error fetching debates:', error);
    }
  };

  const fetchPhotos = async () => {
    try {
      const response = await axios.get(`${API}/photos`);
      setPhotos(response.data);
    } catch (error) {
      console.error('Error fetching photos:', error);
    }
  };

  const fetchPaymentPackages = async () => {
    try {
      const response = await axios.get(`${API}/payments/packages`);
      setPaymentPackages(response.data);
    } catch (error) {
      console.error('Error fetching payment packages:', error);
    }
  };

  const fetchPaymentTransactions = async () => {
    if (!isAdmin) return;
    try {
      const response = await axios.get(`${API}/payments/transactions`);
      setPaymentTransactions(response.data);
    } catch (error) {
      console.error('Error fetching payment transactions:', error);
    }
  };

  const fetchComments = async (debateId) => {
    try {
      const response = await axios.get(`${API}/comments/${debateId}`);
      setComments(response.data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 10;
    if (attempts >= maxAttempts) {
      alert('Payment status check timed out. Please contact admin if payment was made.');
      return;
    }

    try {
      const response = await axios.get(`${API}/payments/checkout/status/${sessionId}`);
      const data = response.data;
      
      if (data.payment_status === 'paid') {
        alert('Payment successful! Thank you for your contribution.');
        if (isAdmin) {
          fetchPaymentTransactions();
        }
        return;
      } else if (data.status === 'expired') {
        alert('Payment session expired. Please try again.');
        return;
      }

      // Continue polling if still pending
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch (error) {
      console.error('Error checking payment status:', error);
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
      alert('Invalid credentials');
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
      alert('Debate created successfully!');
    } catch (error) {
      alert('Error creating debate');
    }
  };

  const handleVote = async (debateId, voteType) => {
    if (!voteForm.voter_name.trim()) {
      alert('Please enter your name to vote');
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
      alert('Vote recorded successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Error voting');
    }
  };

  const handleJoinDebate = async (debateId) => {
    if (!joinForm.participant_name.trim()) {
      alert('Please enter your name to join');
      return;
    }
    try {
      await axios.post(`${API}/debates/join`, {
        debate_id: debateId,
        participant_name: joinForm.participant_name
      });
      setJoinForm({ participant_name: '' });
      fetchDebates();
      alert('Successfully joined the debate!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Error joining debate');
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentForm.author_name.trim() || !commentForm.content.trim()) {
      alert('Please fill in all comment fields');
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
      alert('Error posting comment');
    }
  };

  const handlePhotoUpload = async (e) => {
    e.preventDefault();
    if (!photoForm.file || !photoForm.title.trim()) {
      alert('Please select a file and enter a title');
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
      // Reset file input
      document.getElementById('photo-upload').value = '';
      fetchPhotos();
      alert('Photo uploaded successfully!');
    } catch (error) {
      alert('Error uploading photo');
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!confirm('Are you sure you want to delete this photo?')) return;
    
    try {
      await axios.delete(`${API}/photos/${photoId}`);
      fetchPhotos();
      alert('Photo deleted successfully!');
    } catch (error) {
      alert('Error deleting photo');
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    
    try {
      const response = await axios.post(`${API}/payments/checkout/session`, paymentForm);
      
      if (response.data.url) {
        // Redirect to Stripe checkout
        window.location.href = response.data.url;
      } else {
        alert('Error creating payment session');
      }
    } catch (error) {
      alert(error.response?.data?.detail || 'Error processing payment');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'upcoming': return 'bg-blue-500';
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'paid': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
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
              <h1 className="text-2xl font-bold text-red-700">Debate Club</h1>
            </div>
            <div className="flex items-center space-x-4">
              {isAdmin ? (
                <div className="flex items-center space-x-3">
                  <Badge variant="secondary" className="bg-red-100 text-red-700">
                    <User className="h-3 w-3 mr-1" />
                    Admin
                  </Badge>
                  <Button 
                    onClick={handleLogout}
                    variant="outline" 
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Logout
                  </Button>
                </div>
              ) : (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="bg-red-600 hover:bg-red-700">
                      <Lock className="h-4 w-4 mr-2" />
                      Admin Login
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-red-700">Admin Login</DialogTitle>
                      <DialogDescription>
                        Enter your credentials to access admin features
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <Label htmlFor="username">Username</Label>
                        <Input
                          id="username"
                          value={loginForm.username}
                          onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                          placeholder="admin"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                          placeholder="debateclub123"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">
                        Login
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
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-6 bg-white border border-red-200">
            <TabsTrigger value="debates" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Trophy className="h-4 w-4 mr-2" />
              Debates
            </TabsTrigger>
            <TabsTrigger value="schedule" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Calendar className="h-4 w-4 mr-2" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="photos" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Camera className="h-4 w-4 mr-2" />
              Photos
            </TabsTrigger>
            <TabsTrigger value="payments" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <CreditCard className="h-4 w-4 mr-2" />
              Payments
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="admin" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </TabsTrigger>
                <TabsTrigger value="admin-photos" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Debates Tab */}
          <TabsContent value="debates" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {debates.map((debate) => (
                <Card key={debate.id} className="border-red-200 hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge className={`${getStatusColor(debate.status)} text-white`}>
                        {debate.status}
                      </Badge>
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <Users className="h-4 w-4" />
                        <span>{debate.participants?.length || 0}</span>
                      </div>
                    </div>
                    <CardTitle className="text-red-700">{debate.title}</CardTitle>
                    <CardDescription>{debate.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-gray-600">
                      <strong>Topic:</strong> {debate.topic}
                    </div>
                    <div className="text-sm text-gray-600">
                      <strong>Time:</strong> {formatDate(debate.start_time)}
                    </div>
                    
                    {/* Voting Section */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-4">
                          <div className="text-center">
                            <div className="text-lg font-bold text-green-600">{debate.votes_for}</div>
                            <div className="text-xs text-gray-500">For</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-red-600">{debate.votes_against}</div>
                            <div className="text-xs text-gray-500">Against</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Input
                          placeholder="Your name to vote"
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
                            Vote For
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => handleVote(debate.id, 'against')}
                            className="flex-1 bg-red-600 hover:bg-red-700"
                          >
                            <Vote className="h-3 w-3 mr-1" />
                            Vote Against
                          </Button>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Join Debate */}
                    <div className="space-y-2">
                      <Input
                        placeholder="Your name to join discussion"
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
                        Join Discussion
                      </Button>
                    </div>

                    {/* Comments */}
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
                          View Comments
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="text-red-700">Discussion: {debate.title}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <form onSubmit={handleComment} className="space-y-3">
                            <Input
                              placeholder="Your name"
                              value={commentForm.author_name}
                              onChange={(e) => setCommentForm({...commentForm, author_name: e.target.value})}
                              required
                            />
                            <Textarea
                              placeholder="Share your thoughts on this debate..."
                              value={commentForm.content}
                              onChange={(e) => setCommentForm({...commentForm, content: e.target.value})}
                              required
                            />
                            <Button type="submit" className="bg-red-600 hover:bg-red-700">
                              Post Comment
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

          {/* Schedule Tab */}
          <TabsContent value="schedule">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-700 flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Debate Schedule
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
                      <Badge className={`${getStatusColor(debate.status)} text-white`}>
                        {debate.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-700 flex items-center">
                  <Camera className="h-5 w-5 mr-2" />
                  Event Photos
                </CardTitle>
                <CardDescription>
                  Photos from past debates and club activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {photos.map((photo) => (
                    <Card key={photo.id} className="border-red-200 overflow-hidden">
                      <div className="aspect-video bg-gray-200 flex items-center justify-center">
                        <Image className="h-12 w-12 text-gray-400" />
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
                              Delete
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

          {/* Payments Tab */}
          <TabsContent value="payments">
            <div className="space-y-6">
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-700 flex items-center">
                    <CreditCard className="h-5 w-5 mr-2" />
                    Club Payments
                  </CardTitle>
                  <CardDescription>
                    Support the debate club through memberships and donations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePayment} className="space-y-4">
                    <div>
                      <Label htmlFor="payment_type">Payment Type</Label>
                      <select 
                        id="payment_type"
                        value={paymentForm.payment_type}
                        onChange={(e) => setPaymentForm({...paymentForm, payment_type: e.target.value})}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        {Object.entries(paymentPackages).map(([key, pkg]) => (
                          <option key={key} value={key}>
                            {pkg.description} - ₺{pkg.amount}
                          </option>
                        ))}
                        <option value="donation">Custom Donation</option>
                      </select>
                    </div>
                    
                    {paymentForm.payment_type === 'donation' && (
                      <div>
                        <Label htmlFor="amount">Donation Amount (₺)</Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          min="1"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value)})}
                          placeholder="Enter amount in Turkish Lira"
                          required
                        />
                      </div>
                    )}
                    
                    <div>
                      <Label htmlFor="member_name">Your Name</Label>
                      <Input
                        id="member_name"
                        value={paymentForm.member_name}
                        onChange={(e) => setPaymentForm({...paymentForm, member_name: e.target.value})}
                        placeholder="Enter your name"
                        required
                      />
                    </div>
                    
                    <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">
                      <DollarSign className="h-4 w-4 mr-2" />
                      Proceed to Payment
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Payment Transactions (Admin Only) */}
              {isAdmin && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-700 flex items-center">
                      <Receipt className="h-5 w-5 mr-2" />
                      Payment Transactions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {paymentTransactions.map((transaction) => (
                        <div key={transaction.id} className="flex items-center justify-between p-3 border border-red-200 rounded-lg">
                          <div>
                            <div className="font-semibold text-red-700">
                              ${transaction.amount} - {transaction.payment_type.replace('_', ' ')}
                            </div>
                            <div className="text-sm text-gray-600">
                              {transaction.metadata.member_name} - {formatDate(transaction.created_at)}
                            </div>
                          </div>
                          <Badge className={`${getPaymentStatusColor(transaction.payment_status)} text-white`}>
                            {transaction.payment_status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Admin Create Debate Tab */}
          {isAdmin && (
            <TabsContent value="admin">
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-700 flex items-center">
                    <Plus className="h-5 w-5 mr-2" />
                    Create New Debate
                  </CardTitle>
                  <CardDescription>
                    Schedule and manage debate topics for the club
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateDebate} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="title">Debate Title</Label>
                        <Input
                          id="title"
                          value={debateForm.title}
                          onChange={(e) => setDebateForm({...debateForm, title: e.target.value})}
                          placeholder="Enter debate title"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="topic">Topic</Label>
                        <Input
                          id="topic"
                          value={debateForm.topic}
                          onChange={(e) => setDebateForm({...debateForm, topic: e.target.value})}
                          placeholder="Main debate topic"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={debateForm.description}
                        onChange={(e) => setDebateForm({...debateForm, description: e.target.value})}
                        placeholder="Detailed description of the debate"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="start_time">Start Time</Label>
                        <Input
                          id="start_time"
                          type="datetime-local"
                          value={debateForm.start_time}
                          onChange={(e) => setDebateForm({...debateForm, start_time: e.target.value})}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="end_time">End Time</Label>
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
                      Create Debate
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Admin Photo Upload Tab */}
          {isAdmin && (
            <TabsContent value="admin-photos">
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-700 flex items-center">
                    <Upload className="h-5 w-5 mr-2" />
                    Upload Event Photos
                  </CardTitle>
                  <CardDescription>
                    Add photos from debates and club activities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePhotoUpload} className="space-y-4">
                    <div>
                      <Label htmlFor="photo-upload">Photo File</Label>
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
                        <Label htmlFor="photo-title">Photo Title</Label>
                        <Input
                          id="photo-title"
                          value={photoForm.title}
                          onChange={(e) => setPhotoForm({...photoForm, title: e.target.value})}
                          placeholder="Enter photo title"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="event-date">Event Date</Label>
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
                      <Label htmlFor="photo-description">Description</Label>
                      <Textarea
                        id="photo-description"
                        value={photoForm.description}
                        onChange={(e) => setPhotoForm({...photoForm, description: e.target.value})}
                        placeholder="Describe the event or photo context"
                      />
                    </div>
                    <Button type="submit" className="bg-red-600 hover:bg-red-700">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Photo
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
            <span className="text-xl font-bold">Debate Club</span>
          </div>
          <p className="text-red-200">
            Fostering critical thinking and eloquent discourse since 2025
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;