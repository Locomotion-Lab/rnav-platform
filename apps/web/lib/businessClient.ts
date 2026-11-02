import {consoleApi} from './consoleApi';
import type {profileUpdateSchema,assetRequestSchema,approvePublicationSchema,ProfileResponse,RevisionResponse,SessionResponse,PublicationApproval} from './api-contract';
// Typed v1 entrypoints for future clients and incremental Web adoption; declarations are generated from Zod.
export const businessClient={
 session:()=>consoleApi<SessionResponse>('/api/v1/auth/session'),
 profile:()=>consoleApi<ProfileResponse>('/api/v1/profile'),
 updateProfile:(input:profileUpdateSchema)=>consoleApi<ProfileResponse>('/api/v1/profile',{method:'PUT',body:JSON.stringify(input)}),
 updateAsset:(code:string,input:assetRequestSchema)=>consoleApi<RevisionResponse>(`/api/v1/lab-assets/assets/${encodeURIComponent(code)}`,{method:'PUT',body:JSON.stringify(input)}),
 approvePublication:(id:string,input:approvePublicationSchema)=>consoleApi<PublicationApproval>(`/api/v1/publications/${encodeURIComponent(id)}/approve`,{method:'POST',body:JSON.stringify(input)}),
};
