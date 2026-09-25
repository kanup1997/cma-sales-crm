// Reserve a free connection rather than queuing on a busy connection while
// another is idle. A released connection goes to the oldest waiting operation.
export function createConnectionPool(create,size=4){
  const slots=Array.from({length:size},()=>({connection:create(),busy:false}));
  const waiting=[];
  function lease(slot){
    let released=false;
    return{
      get connection(){return slot.connection;},
      reset(){slot.connection=create();},
      release(){
        if(released)return;
        released=true;
        const next=waiting.shift();
        if(next)next(lease(slot));else slot.busy=false;
      }
    };
  }
  return{acquire(){
    const slot=slots.find(item=>!item.busy);
    if(slot){slot.busy=true;return Promise.resolve(lease(slot));}
    return new Promise(resolve=>waiting.push(resolve));
  }};
}
