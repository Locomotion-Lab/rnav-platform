import {z,type ZodTypeAny} from 'zod';
// Input-side conversion uses the installed, patched Zod 4 schema generator. Runtime refinements remain enforced by the API.
export function toJsonSchema(schema:ZodTypeAny):any {
 return z.toJSONSchema(schema,{target:'draft-7',io:'input',unrepresentable:'any'});
}
export function schemaType(s:any):string {
 if(s.const!==undefined)return JSON.stringify(s.const);
 if(s.enum)return s.enum.map((v:any)=>JSON.stringify(v)).join(' | ');
 if(s.anyOf)return s.anyOf.map(schemaType).join(' | ');
 if(s.$ref)return s.$ref.split('/').at(-1);
 if(s.type==='object'){const parts=Object.entries(s.properties??{}).map(([k,v])=>`${JSON.stringify(k)}${s.required?.includes(k)?'':'?'}: ${schemaType(v)}`);if(s.additionalProperties)parts.push(`[key:string]: ${s.additionalProperties===true?'unknown':schemaType(s.additionalProperties)}`);return'{ '+parts.join('; ')+' }';}
 if(s.type==='array')return'Array<'+schemaType(s.items??{})+'>';
 return({string:'string',number:'number',integer:'number',boolean:'boolean',null:'null'}as any)[s.type]??'unknown';
}
