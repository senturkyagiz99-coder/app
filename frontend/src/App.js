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
import { Users, MessageSquare, Calendar, Trophy, Vote, Plus, Lock, LogOut, User } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [debates, setDebates] = useState([]);
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

  useEffect(() => {
    if (token) {
      setIsAdmin(true);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    fetchDebates();
  }, [token]);

  const fetchDebates = async () => {
    try {
      const response = await axios.get(`${API}/debates`);
      setDebates(response.data);
    } catch (error) {
      console.error('Error fetching debates:', error);
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
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 bg-white border border-red-200">
            <TabsTrigger value="debates" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Trophy className="h-4 w-4 mr-2" />
              Debates
            </TabsTrigger>
            <TabsTrigger value="schedule" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Calendar className="h-4 w-4 mr-2" />
              Schedule
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                <Plus className="h-4 w-4 mr-2" />
                Create Debate
              </TabsTrigger>
            )}
            <TabsTrigger value="about" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              About
            </TabsTrigger>
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

          {/* Admin Tab */}
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

          {/* About Tab */}
          <TabsContent value="about">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-700">About Debate Club</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  Welcome to our Debate Club platform! This is where passionate debaters come together to 
                  engage in meaningful discussions on various topics.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border border-red-200 rounded-lg">
                    <Trophy className="h-8 w-8 text-red-600 mx-auto mb-2" />
                    <h3 className="font-semibold text-red-700">Competitive Debates</h3>
                    <p className="text-sm text-gray-600">Structured debates with voting and scoring</p>
                  </div>
                  <div className="text-center p-4 border border-red-200 rounded-lg">
                    <Users className="h-8 w-8 text-red-600 mx-auto mb-2" />
                    <h3 className="font-semibold text-red-700">Community Driven</h3>
                    <p className="text-sm text-gray-600">Join discussions and share your perspectives</p>
                  </div>
                  <div className="text-center p-4 border border-red-200 rounded-lg">
                    <Calendar className="h-8 w-8 text-red-600 mx-auto mb-2" />
                    <h3 className="font-semibold text-red-700">Scheduled Events</h3>
                    <p className="text-sm text-gray-600">Regular debate sessions and special events</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
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