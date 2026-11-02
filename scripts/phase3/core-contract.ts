import {z} from 'zod';import * as assets from '../../server/services/lab-assets/schemas.js';import * as users from '../../server/services/user-admin/userSchemas.js';import * as profile from '../../server/services/account/profileSchemas.js';import * as media from '../../server/services/media/mediaSchemas.js';import {approvePublicationSchema} from '../../server/routes/publications.js';import {toJsonSchema,schemaType} from './zod-json.js';
const ref=(name:string)=>({$ref:`#/components/schemas/${name}`});
export function coreSchemas(){
 const schemas:any={};
 for(const group of [assets,users,profile,media])for(const [key,s]of Object.entries(group))if(key.endsWith('Schema')&&s instanceof z.ZodType)schemas[key]=toJsonSchema(s);
 const response={
  MembersResponse:z.object({users:z.array(z.object({id:z.string().uuid(),username:z.string(),displayName:z.string()}).passthrough())}).passthrough(),
  LoginRequest:z.object({username:z.string().min(1).max(100),password:z.string().min(1).max(256)}).strict(),
  ChangePassword:z.object({currentPassword:z.string().min(1).max(256),newPassword:z.string().min(1).max(256)}).strict(),
  ErrorResponse:z.object({error:z.string(),code:z.string().optional(),issues:z.array(z.unknown()).optional()}).strict(),
  SessionResponse:z.object({user:z.object({id:z.string().uuid(),username:z.string(),displayName:z.string(),tier:z.enum(['normal','plus','super']),mustChangePassword:z.boolean()}).strict(),permissions:z.array(z.string())}).strict(),
  ProfileResponse:z.object(profile.profileUpdateSchema.shape).extend({userId:z.string().uuid(),username:z.string(),memberSlug:z.string(),memberStatus:z.enum(['current','alumni']),academicStage:z.string(),publicVisible:z.boolean(),accountKind:z.enum(['person','system']),avatarUrl:z.string().nullable(),accountEmail:z.string(),completeness:z.object({}).passthrough()}).passthrough(),
  MediaResponse:z.object({id:z.string().uuid(),filename:z.string(),objectKey:z.string(),url:z.string(),mimeType:z.enum(media.mediaMimeTypes),sizeBytes:z.number().int(),checksumSha256:z.string(),status:z.string(),recycledAt:z.string().nullable(),createdAt:z.string(),references:z.number()}).strict(),
  RevisionResponse:z.object({revision:z.string().regex(/^\d+$/)}).strict(),
  AssetSnapshot:z.object({page:z.unknown(),revision:z.string(),assets:z.array(z.object(assets.assetSchema.shape).passthrough()),platforms:z.array(assets.platformSchema.passthrough()),deviceTypes:z.array(assets.deviceTypeSchema),platformTypes:z.array(assets.platformTypeSchema)}).passthrough(),
  PublicationReview:z.object({id:z.string().uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/),publication:z.object({schemaVersion:z.literal(1),publicationId:z.string(),generatedAt:z.string(),pages:z.record(z.string(),z.unknown()),members:z.record(z.string(),z.unknown()),media:z.array(z.object({path:z.string(),size:z.number().int(),sha256:z.string(),contentType:z.string()}).strict())}).strict()}).strict(),
  PublicationApproval:z.object({id:z.string().uuid(),sha256:z.string(),approved:z.literal(true)}).strict(),
  approvePublicationSchema,
 };
 for(const [key,s]of Object.entries(response))schemas[key]=toJsonSchema(s);
 return schemas;
}
export function enrichContract(contract:any){
 contract.components.schemas=coreSchemas();
 const requests:Record<string,string>={
 'post /api/v1/auth/login':'LoginRequest','post /api/v1/auth/change-password':'ChangePassword',
 'put /api/v1/profile':'profileUpdateSchema','post /api/v1/users':'createUserSchema','put /api/v1/users/{id}/profile':'adminProfileUpdateSchema',
 'post /api/v1/users/import':'importUsersSchema','post /api/v1/users/import/validate':'importUsersSchema',
 'put /api/v1/users/{id}/account-email':'accountEmailSchema','put /api/v1/users/{id}/status':'statusSchema','put /api/v1/users/{id}/tier':'tierSchema',
 'post /api/v1/lab-assets/assets':'assetRequestSchema','put /api/v1/lab-assets/assets/{code}':'assetRequestSchema',
 'post /api/v1/lab-assets/platforms':'platformRequestSchema','put /api/v1/lab-assets/platforms/{code}':'platformRequestSchema',
 'post /api/v1/lab-assets/device-types':'deviceTypeRequestSchema','post /api/v1/lab-assets/platform-types':'platformTypeRequestSchema',
 'post /api/v1/lab-assets/assets/import/commit':'assetImportRequestSchema','post /api/v1/lab-assets/assets/import/validate':'assetImportRequestSchema',
 'post /api/v1/publications/{id}/approve':'approvePublicationSchema'
 };
 for(const [key,name]of Object.entries(requests)){const space=key.indexOf(' '),method=key.slice(0,space),path=key.slice(space+1);const operation=contract.paths[path]?.[method];if(operation)operation.requestBody={required:true,content:{'application/json':{schema:ref(name)}}};}
 for(const [path,operations]of Object.entries(contract.paths) as any){for(const [method,operation]of Object.entries(operations)as any){
  const body=operation['x-request-schema'];if(body&&contract.components.schemas[body])operation.requestBody={required:true,content:{'application/json':{schema:ref(body)}}};
  for(const status of ['400','401','403','409','413','503'])operation.responses[status]={description:status==='503'?'Unavailable or business write freeze':'API error',content:{'application/json':{schema:ref('ErrorResponse')}}};
  if(path.includes('/lab-assets/')&&['post','put','patch','delete'].includes(method)&&!path.includes('inventory')&&!path.includes('/usage-requests')&&!path.endsWith('/validate'))operation.responses['2XX']={description:'Versioned mutation result',content:{'application/json':{schema:ref('RevisionResponse')}}};
 }}
 const response=(path:string,method:string,name:string)=>{contract.paths[path][method].responses['200']={description:'Validated core DTO',content:{'application/json':{schema:ref(name)}}};};
 response('/api/v1/users','get','MembersResponse');response('/api/v1/auth/session','get','SessionResponse');response('/api/v1/auth/login','post','SessionResponse');response('/api/v1/profile','get','ProfileResponse');response('/api/v1/profile','put','ProfileResponse');response('/api/v1/lab-assets','get','AssetSnapshot');response('/api/v1/publications/{id}','get','PublicationReview');response('/api/v1/publications/{id}/approve','post','PublicationApproval');
 contract.paths['/api/v1/media/upload'].post.requestBody={required:true,content:{'multipart/form-data':{schema:{type:'object',required:['file'],properties:{file:{type:'string',format:'binary'}},additionalProperties:false}}}};
 contract.paths['/api/v1/media/upload'].post.responses['201']={description:'Uploaded private asset',content:{'application/json':{schema:ref('MediaResponse')}}};
 contract.paths['/api/v1/media/files/{id}'].get.responses['200']={description:'Authorized binary content',content:{'image/png':{schema:{type:'string',format:'binary'}},'application/pdf':{schema:{type:'string',format:'binary'}}}};
 return contract;
}
export function clientTypes(contract:any){return '// Generated from the same Zod inputs as OpenAPI. Do not edit.\n'+Object.entries(contract.components.schemas).map(([name,s])=>`export type ${name} = ${schemaType(s)};`).join('\n')+'\n';}
