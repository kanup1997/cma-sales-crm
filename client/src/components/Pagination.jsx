import {ChevronLeft,ChevronRight,LoaderCircle} from 'lucide-react';

export const emptyPagination={page:1,pageSize:20,totalItems:0,totalPages:1,hasPrevious:false,hasNext:false};

export function LoadingOverlay({show,label='Loading data'}){
  if(!show)return null;
  return <div className="loading-overlay" role="status"><LoaderCircle size={21}/><span>{label}</span></div>;
}

export default function Pagination({value=emptyPagination,onChange,disabled=false}){
  const {page=1,pageSize=20,totalItems=0,totalPages=1}=value||emptyPagination;
  if(totalItems===0)return null;
  const start=(page-1)*pageSize+1,end=Math.min(page*pageSize,totalItems);
  return <div className="pagination-bar"><span>Showing <strong>{start}-{end}</strong> of <strong>{totalItems}</strong></span><div><label>Rows<select disabled={disabled} value={pageSize} onChange={e=>onChange({page:1,pageSize:Number(e.target.value)})}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label><button type="button" disabled={disabled||page<=1} onClick={()=>onChange({page:page-1,pageSize})} aria-label="Previous page"><ChevronLeft size={16}/></button><span>Page <strong>{page}</strong> of <strong>{totalPages}</strong></span><button type="button" disabled={disabled||page>=totalPages} onClick={()=>onChange({page:page+1,pageSize})} aria-label="Next page"><ChevronRight size={16}/></button></div></div>;
}
