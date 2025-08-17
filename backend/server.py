from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Request
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
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
import asyncio
import json

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

# Stripe configuration
stripe_api_key = os.environ.get('STRIPE_API_KEY')

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

class VoteRequest(BaseModel):
    debate_id: str
    vote_type: str
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

class PaymentTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    payment_type: str  # "membership", "event_registration", "donation"
    amount: float
    currency: str = "try"
    payment_status: str = "pending"
    metadata: Dict[str, str] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PaymentRequest(BaseModel):
    payment_type: str
    amount: Optional[float] = None
    debate_id: Optional[str] = None
    member_name: Optional[str] = None

# Turkish payment packages (Turkish Lira)
PAYMENT_PACKAGES = {
    "membership_monthly": {"amount": 850.0, "description": "Aylık Üyelik Ücreti"},
    "membership_yearly": {"amount": 8500.0, "description": "Yıllık Üyelik Ücreti"},
    "event_registration": {"amount": 500.0, "description": "Etkinlik Kayıt Ücreti"},
    "donation_small": {"amount": 350.0, "description": "Küçük Bağış"},
    "donation_medium": {"amount": 1750.0, "description": "Orta Bağış"},
    "donation_large": {"amount": 3500.0, "description": "Büyük Bağış"}
}

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

# Debate Routes
@api_router.post("/debates", response_model=Debate)
async def create_debate(debate: DebateCreate, current_admin: str = Depends(get_current_admin)):
    debate_obj = Debate(**debate.dict())
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
        raise HTTPException(status_code=404, detail="Debate not found")
    
    update_data = debate_update.dict()
    await db.debates.update_one({"id": debate_id}, {"$set": update_data})
    
    updated_debate = await db.debates.find_one({"id": debate_id})
    return Debate(**updated_debate)

@api_router.delete("/debates/{debate_id}")
async def delete_debate(debate_id: str, current_admin: str = Depends(get_current_admin)):
    result = await db.debates.delete_one({"id": debate_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tartışma bulunamadı")
    return {"message": "Tartışma başarıyla silindi"}

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
        raise HTTPException(status_code=404, detail="Debate not found")
    
    if participant.participant_name in debate.get("participants", []):
        raise HTTPException(status_code=400, detail="Already joined this debate")
    
    await db.debates.update_one(
        {"id": participant.debate_id}, 
        {"$push": {"participants": participant.participant_name}}
    )
    
    return {"message": "Successfully joined the debate"}

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

# Payment Routes
@api_router.get("/payments/packages")
async def get_payment_packages():
    return PAYMENT_PACKAGES

@api_router.post("/payments/checkout/session")
async def create_payment_session(request: Request, payment_request: PaymentRequest, current_admin: str = Depends(get_current_admin)):
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Stripe API key not configured")
    
    # Package details with Turkish Lira
    package_key = f"{payment_request.payment_type}"
    if payment_request.payment_type == "donation" and payment_request.amount:
        amount = payment_request.amount
        description = f"Donation - ₺{amount}"
    elif package_key in PAYMENT_PACKAGES:
        amount = PAYMENT_PACKAGES[package_key]["amount"]
        description = PAYMENT_PACKAGES[package_key]["description"]
    else:
        raise HTTPException(status_code=400, detail="Invalid payment package")
    
    # Setup Stripe
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    # Create URLs
    success_url = f"{host_url}/payments/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{host_url}/payments/cancel"
    
    # Metadata
    metadata = {
        "payment_type": payment_request.payment_type,
        "source": "debate_club",
        "member_name": payment_request.member_name or "Unknown",
        "debate_id": payment_request.debate_id or ""
    }
    
    # Create checkout session
    try:
        checkout_request = CheckoutSessionRequest(
            amount=amount,
            currency="try",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata
        )
        
        session = await stripe_checkout.create_checkout_session(checkout_request)
        
        # Create payment transaction record
        transaction = PaymentTransaction(
            session_id=session.session_id,
            payment_type=payment_request.payment_type,
            amount=amount,
            currency="try",
            payment_status="pending",
            metadata=metadata
        )
        
        await db.payment_transactions.insert_one(transaction.dict())
        
        return {"url": session.url, "session_id": session.session_id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create payment session: {str(e)}")

@api_router.get("/payments/checkout/status/{session_id}")
async def get_payment_status(session_id: str, current_admin: str = Depends(get_current_admin)):
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Stripe API key not configured")
    
    # Get from database first
    transaction = await db.payment_transactions.find_one({"session_id": session_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Payment transaction not found")
    
    # Check with Stripe
    try:
        host_url = "https://debatemaster.preview.emergentagent.com"
        webhook_url = f"{host_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
        
        checkout_status = await stripe_checkout.get_checkout_status(session_id)
        
        # Update database if status changed
        if checkout_status.payment_status != transaction["payment_status"]:
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {
                    "$set": {
                        "payment_status": checkout_status.payment_status,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        
        return {
            "session_id": session_id,
            "payment_status": checkout_status.payment_status,
            "status": checkout_status.status,
            "amount": checkout_status.amount_total / 100,  # Convert from cents
            "currency": checkout_status.currency
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get payment status: {str(e)}")

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Stripe API key not configured")
    
    try:
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        host_url = "https://debatemaster.preview.emergentagent.com"
        webhook_url = f"{host_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        # Update transaction in database
        if webhook_response.session_id:
            await db.payment_transactions.update_one(
                {"session_id": webhook_response.session_id},
                {
                    "$set": {
                        "payment_status": webhook_response.payment_status,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        
        return {"received": True}
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {str(e)}")

@api_router.get("/payments/transactions", response_model=List[PaymentTransaction])
async def get_payment_transactions(current_admin: str = Depends(get_current_admin)):
    transactions = await db.payment_transactions.find().sort("created_at", -1).to_list(1000)
    return [PaymentTransaction(**transaction) for transaction in transactions]

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