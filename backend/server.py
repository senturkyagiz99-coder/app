from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
from email_validator import validate_email, EmailNotValidError

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
    status: str = "upcoming"  # upcoming, active, completed

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
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# Routes
@api_router.post("/admin/login", response_model=Token)
async def admin_login(admin_data: AdminLogin):
    # Simple admin credentials (in production, store hashed in database)
    if admin_data.username == "admin" and admin_data.password == "debateclub123":
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": admin_data.username}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@api_router.post("/debates", response_model=Debate)
async def create_debate(debate: DebateCreate, current_admin: str = Depends(get_current_admin)):
    debate_obj = Debate(**debate.dict())
    await db.debates.insert_one(debate_obj.dict())
    return debate_obj

@api_router.get("/debates", response_model=List[Debate])
async def get_debates():
    debates = await db.debates.find().to_list(1000)
    return [Debate(**debate) for debate in debates]

@api_router.get("/debates/{debate_id}", response_model=Debate)
async def get_debate(debate_id: str):
    debate = await db.debates.find_one({"id": debate_id})
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")
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
        raise HTTPException(status_code=404, detail="Debate not found")
    return {"message": "Debate deleted successfully"}

@api_router.post("/debates/vote")
async def vote_on_debate(vote: VoteRequest):
    debate = await db.debates.find_one({"id": vote.debate_id})
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")
    
    # Check if already voted (simple check by voter name)
    existing_vote = await db.votes.find_one({"debate_id": vote.debate_id, "voter_name": vote.voter_name})
    if existing_vote:
        raise HTTPException(status_code=400, detail="You have already voted on this debate")
    
    # Record the vote
    vote_record = {
        "id": str(uuid.uuid4()),
        "debate_id": vote.debate_id,
        "vote_type": vote.vote_type,
        "voter_name": vote.voter_name,
        "created_at": datetime.utcnow()
    }
    await db.votes.insert_one(vote_record)
    
    # Update debate vote counts
    if vote.vote_type == "for":
        await db.debates.update_one({"id": vote.debate_id}, {"$inc": {"votes_for": 1}})
    else:
        await db.debates.update_one({"id": vote.debate_id}, {"$inc": {"votes_against": 1}})
    
    return {"message": "Vote recorded successfully"}

@api_router.post("/debates/join")
async def join_debate(participant: ParticipantJoin):
    debate = await db.debates.find_one({"id": participant.debate_id})
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")
    
    # Check if already joined
    if participant.participant_name in debate.get("participants", []):
        raise HTTPException(status_code=400, detail="Already joined this debate")
    
    await db.debates.update_one(
        {"id": participant.debate_id}, 
        {"$push": {"participants": participant.participant_name}}
    )
    
    return {"message": "Successfully joined the debate"}

@api_router.post("/comments", response_model=Comment)
async def create_comment(comment: CommentCreate):
    comment_obj = Comment(**comment.dict())
    await db.comments.insert_one(comment_obj.dict())
    return comment_obj

@api_router.get("/comments/{debate_id}", response_model=List[Comment])
async def get_comments(debate_id: str):
    comments = await db.comments.find({"debate_id": debate_id}).sort("created_at", -1).to_list(1000)
    return [Comment(**comment) for comment in comments]

@api_router.get("/")
async def root():
    return {"message": "Debate Club API"}

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