import {Router,type RequestHandler} from 'express';import {z,ZodError} from 'zod';
import {requireLogin} from '../middleware/auth.js';import {requirePermission} from '../middleware/requirePermission.js';import {requirePasswordChanged} from '../middleware/requirePasswordChanged.js';import {createRequireSameOrigin} from '../middleware/requireSameOrigin.js';
import type {createPublisherService} from '../services/public-site/publisher-service.js';
export const publicationId=z.string().uuid();
export const approvePublicationSchema=z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function createPublicationsRouter({authMiddleware,service}:{authMiddleware:RequestHandler;service:ReturnType<typeof createPublisherService>}){
 const r=Router(),same=createRequireSameOrigin({trustProxy:true});
 r.use('/api/publications',authMiddleware,requireLogin,requirePasswordChanged,requirePermission('site.publish'));
 const failure=(e:unknown,res:any)=>res.status(e instanceof ZodError?400:409).json({code:e instanceof ZodError?'VALIDATION_ERROR':'PUBLICATION_CONFLICT',error:'Publication validation, signing or review failed'});
 r.post('/api/publications/prepare',same,async(req,res)=>{try{res.status(201).json(await service.prepare(req.authUser!.id));}catch(e){failure(e,res);}});
 r.get('/api/publications/:id',async(req,res)=>{try{res.json(await service.review(publicationId.parse(req.params.id)));}catch(e){failure(e,res);}});
 r.post('/api/publications/:id/approve',same,async(req,res)=>{try{res.json(await service.approve(publicationId.parse(req.params.id),approvePublicationSchema.parse(req.body).sha256,req.authUser!.id));}catch(e){failure(e,res);}});
 return r;
}
