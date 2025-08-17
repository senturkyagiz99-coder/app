from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Request, Response, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
import shutil
import asyncio
import json
import aiohttp

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Security
SECRET_KEY = "debate_club_secret_key_change_in_production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Upload directory
UPLOAD_DIR = Path(ROOT_DIR) / "uploads" / "photos"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Pydantic Models
class AdminLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    picture: Optional[str] = None
    session_token: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class DebateCreate(BaseModel):
    title: str
    description: str
    topic: str
    start_time: datetime
    end_time: datetime
    status: str = "upcoming"

class Debate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    topic: str
    start_time: datetime
    end_time: datetime
    status: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    votes_for: int = 0
    votes_against: int = 0
    participants: List[str] = []
    created_by: Optional[str] = None  # Admin who created it

class VoteRequest(BaseModel):
    debate_id: str
    vote_type: str  # "for" or "against"
    voter_name: str

class CommentCreate(BaseModel):
    debate_id: str
    content: str
    author_name: str

class Comment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    debate_id: str
    content: str
    author_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ParticipantJoin(BaseModel):
    debate_id: str
    participant_name: str

class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, str]

class NotificationPayload(BaseModel):
    title: str
    body: str
    icon: Optional[str] = "/icon-192x192.png"
    url: Optional[str] = "/"

class Photo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    original_name: str
    title: str
    description: str
    event_date: datetime
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    file_path: str

class PhotoCreate(BaseModel):
    title: str
    description: str
    event_date: str

# Authentication functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Geçersiz kimlik doğrulama bilgileri")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Geçersiz kimlik doğrulama bilgileri")

async def get_current_user(request: Request):
    """Get current user from session cookie or Authorization header"""
    session_token = None
    
    # Try to get from cookie first
    session_token = request.cookies.get("session_token")
    
    # Fallback to Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Kimlik doğrulama gerekli")
    
    # Verify session token in database
    session = await db.sessions.find_one({"session_token": session_token})
    if not session or session["expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Oturum süresi dolmuş")
    
    # Get user data
    user = await db.users.find_one({"id": session["user_id"]})
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
    
    return User(**user)

async def get_session_data_from_emergent(session_id: str):
    """Get user data from Emergent Auth API"""
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return None
        except Exception as e:
            logging.error(f"Error getting session data from Emergent: {str(e)}")
            return None

# Bildirim gönderme fonksiyonu
async def send_push_notification(payload: NotificationPayload):
    """Push bildirimi gönder (gerçek implementasyon için push servisi gerekir)"""
    try:
        # Push notification subscriptions'ları al
        subscriptions = await db.push_subscriptions.find().to_list(1000)
        
        for subscription in subscriptions:
            # Burada gerçek push notification servisi kullanılmalı
            # Şimdilik sadece log'lıyoruz
            logging.info(f"Push notification sent: {payload.title} - {payload.body}")
        
        return True
    except Exception as e:
        logging.error(f"Push notification error: {str(e)}")
        return False

# Routes
@api_router.post("/admin/login", response_model=Token)
async def admin_login(admin_data: AdminLogin):
    if admin_data.username == "debateclub2025" and admin_data.password == "onlinedebate":
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": admin_data.username}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Geçersiz kimlik bilgileri")

@api_router.post("/auth/callback")
async def auth_callback(request: Request, response: Response, session_id: str):
    """Handle OAuth callback from Emergent Auth"""
    try:
        # Get user data from Emergent Auth API
        user_data = await get_session_data_from_emergent(session_id)
        if not user_data:
            raise HTTPException(status_code=400, detail="Geçersiz oturum")
        
        # Check if user exists, if not create new user
        existing_user = await db.users.find_one({"email": user_data["email"]})
        if not existing_user:
            # Create new user
            user = User(
                email=user_data["email"],
                name=user_data["name"],
                picture=user_data.get("picture"),
                session_token=user_data["session_token"]
            )
            await db.users.insert_one(user.dict())
            user_id = user.id
        else:
            user_id = existing_user["id"]
        
        # Create/update session
        expires_at = datetime.utcnow() + timedelta(days=7)
        session_record = {
            "session_token": user_data["session_token"],
            "user_id": user_id,
            "created_at": datetime.utcnow(),
            "expires_at": expires_at
        }
        
        # Remove existing sessions for this user
        await db.sessions.delete_many({"user_id": user_id})
        await db.sessions.insert_one(session_record)
        
        # Set session cookie
        response.set_cookie(
            key="session_token",
            value=user_data["session_token"],
            max_age=7 * 24 * 60 * 60,  # 7 days
            httponly=True,
            secure=True,
            samesite="none",
            path="/"
        )
        
        return {"message": "Giriş başarılı", "user": {"name": user_data["name"], "email": user_data["email"]}}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Giriş hatası: {str(e)}")

@api_router.get("/auth/profile")
async def get_user_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "picture": current_user.picture
    }

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie("session_token", path="/")
    return {"message": "Çıkış yapıldı"}

# Debate Routes
@api_router.post("/debates", response_model=Debate)
async def create_debate(debate: DebateCreate, current_admin: str = Depends(get_current_admin)):
    debate_obj = Debate(**debate.dict(), created_by=current_admin)
    await db.debates.insert_one(debate_obj.dict())
    
    # Yeni münazara bildirimi gönder
    await send_push_notification(NotificationPayload(
        title="Yeni Münazara!",
        body=f"'{debate.title}' başlıklı yeni münazara eklendi",
        url="/"
    ))
    
    return debate_obj

@api_router.get("/debates", response_model=List[Debate])
async def get_debates():
    debates = await db.debates.find().to_list(1000)
    return [Debate(**debate) for debate in debates]

@api_router.get("/debates/{debate_id}", response_model=Debate)
async def get_debate(debate_id: str):
    debate = await db.debates.find_one({"id": debate_id})
    if not debate:
        raise HTTPException(status_code=404, detail="Münazara bulunamadı")
    return Debate(**debate)

@api_router.put("/debates/{debate_id}", response_model=Debate)
async def update_debate(debate_id: str, debate_update: DebateCreate, current_admin: str = Depends(get_current_admin)):
    existing_debate = await db.debates.find_one({"id": debate_id})
    if not existing_debate:
        raise HTTPException(status_code=404, detail="Münazara bulunamadı")
    
    update_data = debate_update.dict()
    await db.debates.update_one({"id": debate_id}, {"$set": update_data})
    
    updated_debate = await db.debates.find_one({"id": debate_id})
    return Debate(**updated_debate)

@api_router.delete("/debates/{debate_id}")
async def delete_debate(debate_id: str, current_admin: str = Depends(get_current_admin)):
    result = await db.debates.delete_one({"id": debate_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Münazara bulunamadı")
    return {"message": "Münazara başarıyla silindi"}

# Push notification endpoints
@api_router.post("/notifications/subscribe")
async def subscribe_to_notifications(subscription: PushSubscription):
    """Push notification aboneliği oluştur"""
    try:
        # Mevcut aboneliği kontrol et
        existing = await db.push_subscriptions.find_one({"endpoint": subscription.endpoint})
        if existing:
            return {"message": "Zaten abone olunmuş"}
        
        # Yeni abonelik oluştur
        subscription_data = {
            "id": str(uuid.uuid4()),
            "endpoint": subscription.endpoint,
            "keys": subscription.keys,
            "created_at": datetime.utcnow()
        }
        
        await db.push_subscriptions.insert_one(subscription_data)
        return {"message": "Bildirim aboneliği başarıyla oluşturuldu"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Abonelik hatası: {str(e)}")

@api_router.delete("/notifications/unsubscribe/{endpoint}")
async def unsubscribe_from_notifications(endpoint: str):
    """Push notification aboneliğini iptal et"""
    try:
        result = await db.push_subscriptions.delete_one({"endpoint": endpoint})
        if result.deleted_count == 0:
            return {"message": "Abonelik bulunamadı"}
        return {"message": "Bildirim aboneliği iptal edildi"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Abonelik iptal hatası: {str(e)}")

@api_router.post("/notifications/send")
async def send_notification(payload: NotificationPayload, current_admin: str = Depends(get_current_admin)):
    """Manuel bildirim gönder (admin only)"""
    success = await send_push_notification(payload)
    if success:
        return {"message": "Bildirim gönderildi"}
    else:
        raise HTTPException(status_code=500, detail="Bildirim gönderilemedi")

@api_router.post("/debates/vote")
async def vote_on_debate(vote: VoteRequest):
    debate = await db.debates.find_one({"id": vote.debate_id})
    if not debate:
        raise HTTPException(status_code=404, detail="Münazara bulunamadı")
    
    existing_vote = await db.votes.find_one({"debate_id": vote.debate_id, "voter_name": vote.voter_name})
    if existing_vote:
        raise HTTPException(status_code=400, detail="Bu münazarada zaten oy kullandınız")
    
    vote_record = {
        "id": str(uuid.uuid4()),
        "debate_id": vote.debate_id,
        "vote_type": vote.vote_type,
        "voter_name": vote.voter_name,
        "created_at": datetime.utcnow()
    }
    await db.votes.insert_one(vote_record)
    
    if vote.vote_type == "for":
        await db.debates.update_one({"id": vote.debate_id}, {"$inc": {"votes_for": 1}})
    else:
        await db.debates.update_one({"id": vote.debate_id}, {"$inc": {"votes_against": 1}})
    
    # Oy bildirimi gönder
    vote_text = "lehinde" if vote.vote_type == "for" else "aleyhinde"
    await send_push_notification(NotificationPayload(
        title="Yeni Oy!",
        body=f"'{debate['title']}' münazarasında {vote_text} yeni oy",
        url="/"
    ))
    
    return {"message": "Oy başarıyla kaydedildi"}

@api_router.post("/debates/join")
async def join_debate(participant: ParticipantJoin):
    debate = await db.debates.find_one({"id": participant.debate_id})
    if not debate:
        raise HTTPException(status_code=404, detail="Münazara bulunamadı")
    
    if participant.participant_name in debate.get("participants", []):
        raise HTTPException(status_code=400, detail="Bu münazaraya zaten katıldınız")
    
    await db.debates.update_one(
        {"id": participant.debate_id}, 
        {"$push": {"participants": participant.participant_name}}
    )
    
    return {"message": "Münazaraya başarıyla katıldınız"}

# Comment Routes
@api_router.post("/comments", response_model=Comment)
async def create_comment(comment: CommentCreate):
    comment_obj = Comment(**comment.dict())
    await db.comments.insert_one(comment_obj.dict())
    return comment_obj

@api_router.get("/comments/{debate_id}", response_model=List[Comment])
async def get_comments(debate_id: str):
    comments = await db.comments.find({"debate_id": debate_id}).sort("created_at", -1).to_list(1000)
    return [Comment(**comment) for comment in comments]

# Photo Routes
@api_router.post("/photos/upload")
async def upload_photo(
    file: UploadFile = File(...),
    title: str = "",
    description: str = "",
    event_date: str = "",
    current_admin: str = Depends(get_current_admin)
):
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Generate unique filename
    file_extension = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Create photo record
    photo_obj = Photo(
        filename=unique_filename,
        original_name=file.filename,
        title=title,
        description=description,
        event_date=datetime.fromisoformat(event_date) if event_date else datetime.utcnow(),
        file_path=str(file_path)
    )
    
    await db.photos.insert_one(photo_obj.dict())
    return {"message": "Photo uploaded successfully", "photo_id": photo_obj.id}

@api_router.get("/photos", response_model=List[Photo])
async def get_photos():
    photos = await db.photos.find().sort("uploaded_at", -1).to_list(1000)
    return [Photo(**photo) for photo in photos]

@api_router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: str, current_admin: str = Depends(get_current_admin)):
    photo = await db.photos.find_one({"id": photo_id})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    # Delete file from filesystem
    try:
        os.remove(photo["file_path"])
    except FileNotFoundError:
        pass  # File already deleted or doesn't exist
    
    # Delete from database
    result = await db.photos.delete_one({"id": photo_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    return {"message": "Photo deleted successfully"}

@api_router.get("/")
async def root():
    return {"message": "Münazara Kulübü API'si"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()