import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {queryOne,run} from '../db.js';

const refreshLifetimeDays=Number(process.env.REFRESH_SESSION_DAYS||90);
const accessLifetime=process.env.ACCESS_TOKEN_LIFETIME||'8h';
const secret=process.env.JWT_SECRET||'dev-secret-change-me';

const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const newToken=()=>crypto.randomBytes(48).toString('base64url');

export function readRefreshToken(req){
  const cookies=String(req.headers.cookie||'').split(';');
  const item=cookies.map(value=>value.trim()).find(value=>value.startsWith('cma_crm_refresh='));
  if(!item)return null;
  try{return decodeURIComponent(item.slice('cma_crm_refresh='.length));}catch{return null;}
}

export function refreshCookieOptions(){
  const sameSite=String(process.env.AUTH_COOKIE_SAME_SITE||'lax').toLowerCase();
  const normalized=['lax','strict','none'].includes(sameSite)?sameSite:'lax';
  return {httpOnly:true,secure:normalized==='none'||process.env.NODE_ENV==='production',sameSite:normalized,path:'/api/auth',maxAge:refreshLifetimeDays*24*60*60*1000};
}

export function clearRefreshCookie(res){
  const {maxAge,...options}=refreshCookieOptions();
  res.clearCookie('cma_crm_refresh',options);
}

function accessToken(user,sessionId){return jwt.sign({id:Number(user.id),role:user.role,sid:sessionId},secret,{expiresIn:accessLifetime});}

export async function createSession(user){
  const id=crypto.randomUUID();const token=newToken();
  await run("INSERT INTO user_sessions(id,user_id,token_hash,expires_at,last_seen_at) VALUES(?,?,?,datetime('now',?),datetime('now'))",[id,Number(user.id),hash(token),`+${refreshLifetimeDays} days`]);
  return {token,accessToken:accessToken(user,id)};
}

export async function refreshSession(rawToken){
  if(!rawToken)return null;
  const session=await queryOne("SELECT s.id session_id,s.user_id,u.id,u.name,u.email,u.role,u.active,u.phone,u.designation,u.city,u.bio,u.created_at FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now')",[hash(rawToken)]);
  if(!session||!session.active)return null;
  const token=newToken();
  await run("UPDATE user_sessions SET token_hash=?,expires_at=datetime('now',?),last_seen_at=datetime('now') WHERE id=?",[hash(token),`+${refreshLifetimeDays} days`,session.session_id]);
  return {token,accessToken:accessToken(session,session.session_id),user:session};
}

export async function revokeRefreshToken(rawToken){
  if(rawToken)await run("UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,datetime('now')) WHERE token_hash=?",[hash(rawToken)]);
}

export async function sessionIsActive(id,userId){
  if(!id)return false;
  return Boolean(await queryOne("SELECT id FROM user_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND datetime(expires_at)>datetime('now')",[id,Number(userId)]));
}

export async function revokeAllUserSessions(userId){await run("UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,datetime('now')) WHERE user_id=?",[Number(userId)]);}
