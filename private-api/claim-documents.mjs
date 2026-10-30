import { createHash } from 'node:crypto'
export const CLAIM_FILE_BYTES=1048576
export function claimDocument(body) {
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>150||/[\x00-\x1f\x7f/\\]/.test(body.name))throw new Error('invalid_document_name')
  if(typeof body.data!=='string'||body.data.length>Math.ceil(CLAIM_FILE_BYTES/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data))throw new Error('invalid_document_data')
  const data=Buffer.from(body.data,'base64')
  if(!data.length||data.length>CLAIM_FILE_BYTES)throw new Error('invalid_document_size')
  const signatures={'application/pdf':Buffer.from('%PDF-'),'image/jpeg':Buffer.from([255,216,255]),'image/png':Buffer.from([137,80,78,71,13,10,26,10])}
  const signature=signatures[body.mime]
  if(!signature||!data.subarray(0,signature.length).equals(signature))throw new Error('invalid_document_type')
  return {name:body.name.trim(),mime:body.mime,data,sha256:createHash('sha256').update(data).digest('hex')}
}
