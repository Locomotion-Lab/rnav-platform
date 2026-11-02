import {readFile} from 'node:fs/promises';
const r=JSON.parse(await readFile(process.argv[2]??'docs/phase3/READINESS.json','utf8'));
const required=['explicit_change_approval','certificate_renewed','authorized_real_data_restore_and_cos_sha256','real_cloud_mac_tunnel_and_https_browser_acceptance','offsite_receiver_key_custody_and_restore','filevault_unlock_and_restart_drill'];
const engineering=['synthetic_dual_node_ssh_rehearsal','signed_publication_and_offline_public_site','separate_low_privilege_roles','resumable_media_transfer','joint_isolated_restore'];
const blocked=required.filter(key=>r.production_gates?.[key]!==true);
for(const key of engineering)if(r.engineering?.[key]!==true)blocked.push('engineering:'+key);
if(r.engineering?.production_dependency_high_or_critical!==0)blocked.push('dependency-security');
console.log(JSON.stringify({productionReady:blocked.length===0,blocked,engineering:r.engineering},null,2));if(blocked.length)process.exitCode=2;
