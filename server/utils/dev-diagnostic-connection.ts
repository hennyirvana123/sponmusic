export function diagnosticModelUrl(){
 if(!import.meta.dev)throw Error('Development diagnostic disabled');
 const value=(process.env.DEV_BASIC_PITCH_URL||process.env.BASIC_PITCH_URL||process.env.NITRO_PIANO_MODEL_URL||'').trim();
 if(!value)throw Error('Preview model URL missing. Set DEV_BASIC_PITCH_URL on the development server to the existing Basic Pitch /transcribe endpoint. Production configuration is unchanged.');
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Invalid development model URL');
 url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/transcribe$/,'')+'/transcribe';
 return url;
}
