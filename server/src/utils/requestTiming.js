import {AsyncLocalStorage} from 'node:async_hooks';

const requests=new AsyncLocalStorage();

export function requestTiming(req,res,next){
  const context={started:performance.now(),queries:[],count:0};
  const end=res.end;
  res.end=function(...args){
    if(!res.headersSent){
      const entries=[`app;dur=${(performance.now()-context.started).toFixed(1)}`];
      for(const query of context.queries)entries.push(`db${query.id};dur=${query.duration.toFixed(1)};desc="${query.label}"`);
      res.setHeader('Server-Timing',entries.join(', '));
    }
    return end.apply(this,args);
  };
  requests.run(context,next);
}

export async function timeDatabase(label,work){
  const context=requests.getStore();
  if(!context)return work();
  const id=++context.count,started=performance.now();
  try{return await work();}
  finally{
    // Fixed labels only: never expose SQL, query parameters or customer data.
    if(id<=12)context.queries.push({id,label,duration:performance.now()-started});
  }
}

export function databaseLabel(sql){
  if(/\bFROM users\b/i.test(sql))return 'auth-users';
  if(/\bFROM masters\b/i.test(sql))return 'masters';
  if(/\bFROM lead_progress\b/i.test(sql))return 'lead-progress';
  if(/\bFROM leads\b/i.test(sql))return /SELECT COUNT\(\*\)/i.test(sql)?'lead-count':'lead-list';
  if(/\blead_notifications\b/i.test(sql))return 'notifications';
  return 'database';
}
