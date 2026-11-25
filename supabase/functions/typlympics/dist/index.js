import le from"npm:postgres@3.4.5";function G(e){let t=1779033703^e.length;for(let n=0;n<e.length;n++)t=Math.imul(t^e.charCodeAt(n),3432918353),t=t<<13|t>>>19;return()=>(t=Math.imul(t^t>>>16,2246822507),t=Math.imul(t^t>>>13,3266489909),t^=t>>>16,t>>>0)}function N(e){let t=G(e)(),n=()=>{t=t+1831565813|0;let r=Math.imul(t^t>>>15,1|t);return r=r+Math.imul(r^r>>>7,61|r)^r,((r^r>>>14)>>>0)/4294967296},s=r=>Math.floor(n()*r);return{next:n,int:s,pick(r){if(r.length===0)throw new Error("cannot pick from an empty list");return r[s(r.length)]}}}var H=`
of to in it is be as at so we he by or on do if me my up an go no us am
the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use
that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what year also back call down even find give hand high keep last left life live look most move must name need next open part play real room same seem show side tell then turn walk week work
about after again being could every first found great house large learn never other place plant point right small sound spell still study their there these thing think three water where which world would write young under while might night light start state story party paper music group early earth happy heart heavy horse money month river
before better change school should people number mother father friend around little always animal answer almost family follow letter listen second simple street strong system travel window wonder across during enough ground making really
because between through another thought against country picture several morning nothing outside present problem program quickly science someone teacher without general example brought
children together question remember sentence business complete consider continue describe distance exercise familiar interest language mountain personal possible practice probably standing surprise thousand tomorrow yourself
`,v=Object.freeze(Array.from(new Set(H.split(/\s+/).filter(e=>e.length>0)))),S=2,O=8;var $=1,P=Object.freeze({min:5.5,max:13.5});function W(e){let t=e/100;return{min:P.min*t,max:P.max*t}}var C=200,V=(()=>{let e=new Map;for(let t of v){let n=e.get(t.length)??[];n.push(t),e.set(t.length,n)}return e})(),M=(()=>{let e=["qaz","wsx","edc","rfvtgb","yhnujm","ik","ol","p"],t={};return e.forEach((n,s)=>{for(let r of n)t[r]=s}),t})(),F=new Set(["q","z","x","j"]);function q(e){let t=0;for(let n=0;n<e.length;n++){let s=e[n];if(F.has(s)&&(t+=1.5),n===0)continue;let r=e[n-1];s===" "||r===" "||(s===r?t+=.5:M[s]!==void 0&&M[s]===M[r]&&(t+=2))}return t}function X(e,t){if(t<S)throw new Error(`length ${t} is too short for a line`);let n=[],s=t,r="";for(;;){if(s<=O){let o=(V.get(s)??[]).filter(d=>d!==r);n.push(e.pick(o));break}let a;do a=e.pick(v);while(a===r||s-a.length-1<S);n.push(a),r=a,s-=a.length+1}return n.join(" ")}function L(e,t=100){let n=N(`sprint:${$}:${t}:${e}`),s=W(t),r=null;for(let o=1;o<=C;o++){let d=X(n,t),m=q(d);if(m>=s.min&&m<=s.max)return{seed:e,text:d,difficulty:m,attempts:o,generatorVersion:$};let l=Math.min(Math.abs(m-s.min),Math.abs(m-s.max));(r===null||l<r.distance)&&(r={text:d,difficulty:m,distance:l})}let a=r;return{seed:e,text:a.text,difficulty:a.difficulty,attempts:C,generatorVersion:$}}var J=["FUCK","SHIT","BITCH","CUNT","NIGG","NIGA","FAGG","FAGOT","DYKE","KIKE","CHINK","GOOK","WETBACK","TRANNY","RETARD","WHORE","SLUT","PUSSY","PENIS","VAGINA","RAPIST","PEDO","NAZI","HITLER","KKK","PORN","JIZZ","WANK","TWAT","BASTARD","ASSHOLE","ARSEHOLE","DOUCHE","BOLLOCK","MILF","DILDO","BLOWJOB","HANDJOB","CUMSHOT"],B=["DICK","COCK","SPIC","RAPE","ANUS","ASS","ARSE","CUM","FAG","TIT","TITS","SEX","HOE","COON","JAP","PISS","CRAP","DAMN","HELL"],Z={0:"O",1:"I",3:"E",4:"A",5:"S",7:"T",8:"B",9:"G"};function Q(e){return e.toUpperCase().replace(/[0-9]/g,t=>Z[t]??"")}function D(e){let t=Q(e),n=t.replace(/[^A-Z]/g,""),s=n.replace(/(.)\1+/g,"$1");for(let a of J){if(n.includes(a))return!1;let o=a.replace(/(.)\1+/g,"$1");if(o.length>=4&&s.includes(o))return!1}return!t.split(/[^A-Z]+/).filter(Boolean).some(a=>B.includes(a))&&!B.includes(n)}var T=Object.freeze(["100m","200m","400m","800m"]),ee=Object.freeze({id:"100m@1",event:"100m",version:1,distance:100,errorLockoutMs:200,falseStartPenaltyMs:300,minReactionMs:100,splitMarks:Object.freeze([30,60,100]),medalsMs:Object.freeze({bronze:2e4,silver:15e3,gold:12e3,worldClass:1e4})});function _(e,t,n){let s=r=>Math.round(t/5/r*6e4);return Object.freeze({id:`${e}@1`,event:e,version:1,distance:t,errorLockoutMs:200,falseStartPenaltyMs:300,minReactionMs:100,splitMarks:Object.freeze(n),medalsMs:Object.freeze({bronze:s(60),silver:s(80),gold:s(100),worldClass:s(120)})})}var te=_("200m",200,[50,100,150,200]),ne=_("400m",400,[100,200,300,400]),re=_("800m",800,[200,400,600,800]),ae=_("1500m",1500,[400,800,1200,1500]),f=Object.freeze({"100m":ee,"200m":te,"400m":ne,"800m":re,"1500m":ae});var y=class extends Error{constructor(t){super(t),this.name="SimInputError"}};function oe(e,t){if(t.length!==e.distance)throw new y(`text length ${t.length} does not match race distance ${e.distance}`);return{ruleset:e,text:t,pos:0,lockedUntil:Number.NEGATIVE_INFINITY,lastT:Number.NEGATIVE_INFINITY,errors:0,ignored:0,falseStart:!1,reactionMs:null,advanceTimes:[],finished:!1}}function se(e,t){if(!Number.isInteger(t.t))throw new y(`timestamp must be an integer number of ms, got ${t.t}`);if(typeof t.ch!="string"||t.ch.length!==1)throw new y("input must be exactly one character");if(t.t<e.lastT)throw new y(`timestamps must not decrease (${t.t} after ${e.lastT})`);if(e.finished)return"afterFinish";let n=e.ruleset;return e.lastT=t.t,t.t<0?(e.falseStart=!0,e.lockedUntil=Math.max(e.lockedUntil,n.falseStartPenaltyMs),"falseStart"):e.reactionMs===null&&(e.reactionMs=t.t,t.t<n.minReactionMs)?(e.falseStart=!0,e.lockedUntil=Math.max(e.lockedUntil,t.t+n.falseStartPenaltyMs),"falseStart"):t.t<e.lockedUntil?(e.ignored+=1,"locked"):t.ch===e.text[e.pos]?(e.pos+=1,e.advanceTimes.push(t.t),e.pos===n.distance?(e.finished=!0,"finish"):"advance"):(e.errors+=1,e.lockedUntil=t.t+n.errorLockoutMs,"error")}function ie(e){let t=e.ruleset,n=e.finished?e.advanceTimes[t.distance-1]??null:null,s=e.pos+e.errors,r=[];for(let a of t.splitMarks){let o=e.advanceTimes[a-1];o!==void 0&&r.push({mark:a,tMs:o})}return{rulesetId:t.id,finished:e.finished,timeMs:n,reactionMs:e.reactionMs,falseStart:e.falseStart,distance:e.pos,errors:e.errors,ignored:e.ignored,accuracy:s===0?1:e.pos/s,wpm:n!==null&&n>0?t.distance/5/(n/6e4):null,splits:r,advanceTimes:e.advanceTimes.slice()}}function U(e,t,n){let s=oe(e,t);for(let r of n)se(s,r);return ie(s)}var i=le(Deno.env.get("SUPABASE_DB_URL"),{prepare:!1,max:2,idle_timeout:20}),I=4,ce=5,Y=15,me=6e3,de=20,ue=8e3,pe=1500,we=300,j={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"},c=class extends Error{constructor(n,s,r=400){super(s);this.code=n;this.status=r}code;status};function u(e,t){let n=e[t];if(typeof n!="string")throw new c("bad_request",`"${t}" is required.`);return n}function b(e){return e.device==="phone"?"phone":"keyboard"}function ye(e){return e.toUpperCase().replace(/[^A-Z0-9 ]/g,"").replace(/\s+/g," ").trim().slice(0,12).trim()}function z(e){let t=new Uint8Array(e);return crypto.getRandomValues(t),Array.from(t,n=>n.toString(16).padStart(2,"0")).join("")}async function K(e){let t=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(e));return Array.from(new Uint8Array(t),n=>n.toString(16).padStart(2,"0")).join("")}async function he(e){let t=ye(u(e,"name")),n=u(e,"pin"),s=typeof e.nationality=="string"?e.nationality.toUpperCase():"";if(!t)throw new c("bad_name","A name is required.");if(!/^[0-9]{4}$/.test(n))throw new c("bad_pin","The PIN must be four digits.");let r=!1,a=await i`
    select id, name, nationality, pin_hash = extensions.crypt(${n}, pin_hash) as ok,
           coalesce(locked_until > now(), false) as locked
    from typlympics.athletes where name = ${t}`;if(a.length===0){if(!D(t))throw new c("bad_name","Pick another name.");if(!/^[A-Z]{3}$/.test(s))throw new c("bad_nationality","A nationality is required for a new athlete.");if(a=await i`
      insert into typlympics.athletes (name, nationality, pin_hash)
      values (${t}, ${s}, extensions.crypt(${n}, extensions.gen_salt('bf', 10)))
      on conflict (name) do nothing
      returning id, name, nationality, true as ok, false as locked`,a.length===0)throw new c("name_taken","That name was just taken. Try again.");r=!0}let o=a[0];if(o.locked)throw new c("locked",`Too many wrong PINs. Try again in ${Y} minutes.`,429);if(!o.ok)throw await i`
      update typlympics.athletes
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= ${ce} then now() + make_interval(mins => ${Y}) else locked_until end
      where id = ${o.id}`,new c("wrong_pin","That name is taken online and the PIN does not match.",401);r||await i`update typlympics.athletes set failed_attempts = 0, locked_until = null where id = ${o.id}`;let d=z(32);return await i`insert into typlympics.sessions (token_hash, athlete_id) values (${await K(d)}, ${o.id})`,await i`delete from typlympics.sessions where athlete_id = ${o.id} and last_seen < now() - interval '30 days'`,{token:d,created:r,athlete:{id:o.id,name:o.name,nationality:o.nationality}}}async function p(e){let t=u(e,"token"),n=await i`
    update typlympics.sessions s set last_seen = now()
    from typlympics.athletes a
    where s.token_hash = ${await K(t)} and a.id = s.athlete_id
    returning a.id, a.name, a.nationality`;if(n.length===0)throw new c("signed_out","Sign in again.",401);return n[0]}async function fe(e){return 6e4+f[e].distance*4e3}async function x(e){let n=(await i`
    select r.id, r.event, extract(epoch from (now() - r.gun_at)) * 1000 as since_gun
    from typlympics.rooms m join typlympics.races r on r.id = m.race_id
    where m.pin = ${e} and m.state = 'racing'`)[0];n&&Number(n.since_gun)>await fe(n.event)&&(await i`update typlympics.race_entries set status = 'dnf', submitted_at = now() where race_id = ${n.id} and status = 'racing'`,await i`update typlympics.rooms set state = 'done', updated_at = now() where pin = ${e}`)}async function k(e){let n=(await i`select pin, host_id, event, state, race_id from typlympics.rooms where pin = ${e}`)[0];if(!n)throw new c("no_room","No race room has that PIN.",404);let s=await i`
    select a.id, a.name, a.nationality, m.lane, m.device
    from typlympics.room_members m join typlympics.athletes a on a.id = m.athlete_id
    where m.pin = ${e} order by m.lane`,r=null;if(n.race_id){let o=(await i`
      select id, event, ruleset_id, seed, extract(epoch from (gun_at - now())) * 1000 as gun_in_ms
      from typlympics.races where id = ${n.race_id}`)[0];o&&(r={id:o.id,event:o.event,rulesetId:o.ruleset_id,seed:o.seed,gunInMs:Math.round(Number(o.gun_in_ms))})}return{pin:n.pin,hostId:n.host_id,event:n.event,state:n.state,maxPlayers:I,members:s,race:r}}async function A(e){await i`
    delete from typlympics.room_members m using typlympics.rooms r
    where m.pin = ${e} and r.pin = m.pin and r.state <> 'racing'
      and m.last_seen < now() - make_interval(secs => ${de})`;let n=(await i`
    select r.host_id, (select athlete_id from typlympics.room_members where pin = r.pin order by lane limit 1) as first_member,
           exists (select 1 from typlympics.room_members where pin = r.pin and athlete_id = r.host_id) as host_present
    from typlympics.rooms r where r.pin = ${e}`)[0];n&&(n.first_member?n.host_present||await i`update typlympics.rooms set host_id = ${n.first_member} where pin = ${e}`:await i`delete from typlympics.rooms where pin = ${e}`)}async function _e(e){let t=await p(e),n=u(e,"event");if(!T.includes(n))throw new c("bad_event","Unknown distance.");await i`delete from typlympics.rooms where host_id = ${t.id} or updated_at < now() - interval '6 hours'`,await i`delete from typlympics.room_members where athlete_id = ${t.id}`;for(let s=0;s<12;s++){let r=String(1e4+crypto.getRandomValues(new Uint32Array(1))[0]%9e4);if((await i`
      insert into typlympics.rooms (pin, host_id, event) values (${r}, ${t.id}, ${n})
      on conflict (pin) do nothing returning pin`).length)return await i`insert into typlympics.room_members (pin, athlete_id, lane, device) values (${r}, ${t.id}, 0, ${b(e)})`,{room:await k(r),you:t.id}}throw new c("busy","Could not open a room. Try again.",503)}async function ge(e){let t=await p(e),n=u(e,"pin");await A(n);let r=(await i`select state from typlympics.rooms where pin = ${n}`)[0];if(!r)throw new c("no_room","No race room has that PIN.",404);if((await i`select 1 from typlympics.room_members where pin = ${n} and athlete_id = ${t.id}`).length===0){if(r.state==="racing")throw new c("in_progress","That race has already started. Wait for the next one.");if(await i`delete from typlympics.room_members where athlete_id = ${t.id}`,(await i`
      insert into typlympics.room_members (pin, athlete_id, lane, device)
      select ${n}, ${t.id}, lane, ${b(e)} from generate_series(0, ${I-1}) as lane
      where lane not in (select lane from typlympics.room_members where pin = ${n})
      order by lane limit 1
      on conflict do nothing returning lane`).length===0)throw new c("full",`That room is full (${I} athletes).`)}return{room:await k(n),you:t.id}}async function be(e){let t=await p(e),n=u(e,"pin");if((await i`
    update typlympics.room_members set last_seen = now(), device = ${b(e)}
    where pin = ${n} and athlete_id = ${t.id} returning 1`).length===0)throw new c("not_member","You are not in that room.",403);return await A(n),await x(n),{room:await k(n),you:t.id}}async function ke(e){let t=await p(e),n=u(e,"pin");return await i`delete from typlympics.room_members where pin = ${n} and athlete_id = ${t.id}`,await A(n),{}}async function Re(e){let t=await p(e),n=u(e,"pin");await x(n);let r=(await i`select host_id, event, state from typlympics.rooms where pin = ${n}`)[0];if(!r)throw new c("no_room","No race room has that PIN.",404);if(r.host_id!==t.id)throw new c("not_host","Only the host can start the race.",403);if(r.state==="racing")throw new c("in_progress","A race is already running.");let a=typeof e.event=="string"&&T.includes(e.event)?e.event:r.event,o=me+crypto.getRandomValues(new Uint32Array(1))[0]%1500,m=(await i`
    insert into typlympics.races (pin, event, ruleset_id, seed, gun_at)
    values (${n}, ${a}, ${f[a].id}, ${z(8)}, now() + make_interval(secs => ${o/1e3}))
    returning id`)[0].id;return await i`
    insert into typlympics.race_entries (race_id, athlete_id, lane)
    select ${m}, athlete_id, lane from typlympics.room_members where pin = ${n}`,await i`update typlympics.rooms set state = 'racing', race_id = ${m}, event = ${a}, updated_at = now() where pin = ${n}`,{room:await k(n),you:t.id}}function ve(e,t){if(!Array.isArray(e))throw new c("bad_log","A keystroke log is required.");if(e.length>t*4+200)throw new c("bad_log","The keystroke log is too long.");return e.map(n=>{if(!Array.isArray(n)||!Number.isInteger(n[0])||typeof n[1]!="string"||n[1].length!==1)throw new c("bad_log","The keystroke log is malformed.");return{t:n[0],ch:n[1]}})}async function Se(e){let t=await p(e),n=u(e,"raceId"),r=(await i`
    select r.id, r.pin, r.event, r.seed, e.status, extract(epoch from (now() - r.gun_at)) * 1000 as since_gun
    from typlympics.races r join typlympics.race_entries e on e.race_id = r.id
    where r.id = ${n} and e.athlete_id = ${t.id}`)[0];if(!r)throw new c("not_entered","You are not entered in that race.",403);if(r.status!=="racing")throw new c("already_submitted","A result is already recorded for this race.",409);let a=f[r.event],o=b(e),d=ve(e.log,a.distance),m=L(r.seed,a.distance).text,l;try{l=U(a,m,d)}catch{throw new c("bad_log","The keystroke log breaks the rules of the race.")}let w=l.finished?"finished":"dnf";if(l.finished&&l.timeMs!==null){let R=Number(r.since_gun)-l.timeMs;(R>ue||R<-pe||(l.wpm??0)>we)&&(w="review")}await i`
    update typlympics.race_entries
    set status = ${w}, time_ms = ${l.timeMs}, wpm = ${l.wpm===null?null:Math.round(l.wpm*100)/100},
        accuracy = ${Math.round(l.accuracy*1e5)/1e5}, reaction_ms = ${l.reactionMs},
        errors = ${l.errors}, false_start = ${l.falseStart}, log = ${i.json(e.log)}, submitted_at = now(),
        device = ${o}
    where race_id = ${n} and athlete_id = ${t.id} and status = 'racing'`;let h=!1;return w==="finished"&&l.timeMs!==null&&l.wpm!==null&&(h=(await i`
      insert into typlympics.bests (athlete_id, ruleset_id, device, time_ms, wpm, race_id)
      values (${t.id}, ${a.id}, ${o}, ${l.timeMs}, ${Math.round(l.wpm*100)/100}, ${n})
      on conflict (athlete_id, ruleset_id, device) do update
        set time_ms = excluded.time_ms, wpm = excluded.wpm, race_id = excluded.race_id, achieved_at = now()
        where typlympics.bests.time_ms > excluded.time_ms
      returning 1`).length>0),(await i`select 1 from typlympics.race_entries where race_id = ${n} and status = 'racing' limit 1`).length===0&&await i`update typlympics.rooms set state = 'done', updated_at = now() where pin = ${r.pin} and race_id = ${n}`,{result:{status:w,device:o,timeMs:l.timeMs,wpm:l.wpm,accuracy:l.accuracy,reactionMs:l.reactionMs,errors:l.errors,falseStart:l.falseStart,personalBest:h}}}async function $e(e){let t=await p(e),n=u(e,"raceId"),s=Math.max(0,Math.min(2e3,Math.floor(Number(e.pos)||0)));return await i`
    update typlympics.race_entries set progress = greatest(progress, ${s})
    where race_id = ${n} and athlete_id = ${t.id} and status = 'racing'`,{positions:(await i`
    select athlete_id as id, progress, status, time_ms from typlympics.race_entries where race_id = ${n}`).map(a=>({id:a.id,pos:a.progress,status:a.status,timeMs:a.time_ms}))}}async function Me(e){await p(e);let t=u(e,"raceId"),n=await i`select pin from typlympics.races where id = ${t}`;n[0]&&await x(n[0].pin);let s=await i`
    select a.id, a.name, a.nationality, e.lane, e.status, e.device, e.time_ms, e.wpm, e.accuracy, e.reaction_ms, e.false_start
    from typlympics.race_entries e join typlympics.athletes a on a.id = e.athlete_id
    where e.race_id = ${t}
    order by (e.status = 'finished') desc, e.time_ms asc nulls last, e.lane`,r=0;return{done:s.every(a=>a.status!=="racing"),entries:s.map(a=>({id:a.id,name:a.name,nationality:a.nationality,lane:a.lane,status:a.status,device:a.device,place:a.status==="finished"?++r:null,timeMs:a.time_ms,wpm:a.wpm===null?null:Number(a.wpm),accuracy:a.accuracy===null?null:Number(a.accuracy),reactionMs:a.reaction_ms,falseStart:a.false_start}))}}async function Te(){let e=await i`
    select * from (
      select b.ruleset_id, b.device, a.name, a.nationality, b.time_ms, b.wpm, b.achieved_at,
             row_number() over (partition by b.ruleset_id, b.device order by b.time_ms, b.achieved_at) as rank
      from typlympics.bests b join typlympics.athletes a on a.id = b.athlete_id
    ) ranked where rank <= 10 order by ruleset_id, device, rank`,t=await i`
    select * from (
      select a.name, a.nationality, b.wpm, b.ruleset_id, b.device,
             row_number() over (partition by b.device order by b.wpm desc, b.achieved_at) as rank
      from typlympics.bests b join typlympics.athletes a on a.id = b.athlete_id
    ) ranked where rank <= 10 order by device, rank`,n=await i`
    with ranked as (
      select athlete_id, rank() over (partition by race_id order by time_ms) as place, count(*) over (partition by race_id) as field
      from typlympics.race_entries where status = 'finished'
    )
    select a.name, a.nationality, count(*)::int as wins
    from ranked r join typlympics.athletes a on a.id = r.athlete_id
    where r.place = 1 and r.field >= 2
    group by a.id order by wins desc, a.name limit 10`,s={},r={};for(let o of e){let d=o.device==="phone"?r:s;(d[o.ruleset_id]??=[]).push({rank:Number(o.rank),name:o.name,nationality:o.nationality,timeMs:o.time_ms,wpm:Number(o.wpm),at:o.achieved_at})}let a=o=>({name:o.name,nationality:o.nationality,wpm:Number(o.wpm),rulesetId:o.ruleset_id});return{boards:s,phoneBoards:r,topSpeed:t.filter(o=>o.device!=="phone").map(a),phoneTopSpeed:t.filter(o=>o.device==="phone").map(a),mostWins:n}}function E(e){return{weekStart:e.week_start,rulesetId:e.ruleset_id,device:e.device,rank:e.rank,name:e.name,nationality:e.nationality,timeMs:e.time_ms}}async function Ie(){await i`select typlympics.close_weeks()`;let e=await i`
    select to_char(date_trunc('week', now() at time zone 'utc'), 'YYYY-MM-DD') as week_start,
           extract(epoch from ((date_trunc('week', now() at time zone 'utc') + interval '7 days') - (now() at time zone 'utc'))) * 1000 as ends_in_ms`,t=await i`
    with best as (
      select r.ruleset_id, e.device, e.athlete_id, min(e.time_ms) as time_ms
      from typlympics.race_entries e join typlympics.races r on r.id = e.race_id
      where e.status = 'finished'
        and e.submitted_at >= (date_trunc('week', now() at time zone 'utc') at time zone 'utc')
      group by 1, 2, 3
    ),
    ranked as (
      select b.*, rank() over (partition by ruleset_id, device order by time_ms) as place from best b
    )
    select k.ruleset_id, k.device, k.place, k.time_ms, a.name, a.nationality
    from ranked k join typlympics.athletes a on a.id = k.athlete_id
    where k.place <= 10 order by k.ruleset_id, k.device, k.place, a.name`,n=await i`
    select to_char(m.week_start, 'YYYY-MM-DD') as week_start, m.ruleset_id, m.device, m.rank, m.time_ms, a.name, a.nationality
    from typlympics.weekly_medals m join typlympics.athletes a on a.id = m.athlete_id
    where m.week_start = (select max(week_start) from typlympics.weekly_medals)
    order by m.ruleset_id, m.device, m.rank, a.name`,s={},r={};for(let o of t){let d=o.device==="phone"?r:s,m=(f[String(o.ruleset_id).split("@")[0]]?.distance??0)/5/(o.time_ms/6e4);(d[o.ruleset_id]??=[]).push({rank:Number(o.place),name:o.name,nationality:o.nationality,timeMs:o.time_ms,wpm:Math.round(m*100)/100})}let a=e[0];return{weekStart:a.week_start,endsInMs:Math.max(0,Math.round(Number(a.ends_in_ms))),boards:s,phoneBoards:r,lastWeek:n.length?{weekStart:n[0].week_start,medals:n.map(E)}:null}}async function xe(e){await i`select typlympics.close_weeks()`;let n=(await i`
    select distinct to_char(week_start, 'YYYY-MM') as month from typlympics.weekly_medals order by 1 desc`).map(d=>d.month),r=(typeof e.month=="string"&&/^[0-9]{4}-[0-9]{2}$/.test(e.month)?e.month:null)??n[0]??null,a=r?await i`
        select to_char(m.week_start, 'YYYY-MM-DD') as week_start, m.ruleset_id, m.device, m.rank, m.time_ms, a.name, a.nationality
        from typlympics.weekly_medals m join typlympics.athletes a on a.id = m.athlete_id
        where to_char(m.week_start, 'YYYY-MM') = ${r}
        order by m.week_start desc, m.ruleset_id, m.device, m.rank, a.name`:[],o=await i`
    select a.name, a.nationality,
           count(*) filter (where m.rank = 1)::int as gold,
           count(*) filter (where m.rank = 2)::int as silver,
           count(*) filter (where m.rank = 3)::int as bronze
    from typlympics.weekly_medals m join typlympics.athletes a on a.id = m.athlete_id
    group by a.id order by gold desc, silver desc, bronze desc, a.name limit 10`;return{months:n,month:r,medals:a.map(E),medalTable:o}}async function Ae(e){let t=await p(e);await i`select typlympics.close_weeks()`;let n=await i`
    select to_char(m.week_start, 'YYYY-MM-DD') as week_start, m.ruleset_id, m.device, m.rank, m.time_ms, a.name, a.nationality
    from typlympics.weekly_medals m join typlympics.athletes a on a.id = m.athlete_id
    where m.athlete_id = ${t.id} order by m.week_start desc, m.rank limit 60`,s=r=>n.filter(a=>a.rank===r).length;return{gold:s(1),silver:s(2),bronze:s(3),medals:n.map(E)}}var Ee=8,Ne=40,Oe=16e3,Pe=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;async function Ce(e){let t=await p(e),n=u(e,"pin"),s=e.on!==!1;if((await i`
    update typlympics.room_members set voice_at = case when ${s} then now() else null end
    where pin = ${n} and athlete_id = ${t.id} returning 1`).length===0)throw new c("not_member","You are not in that room.",403);if(!s)return await i`delete from typlympics.voice_signals where pin = ${n} and (to_id = ${t.id} or from_id = ${t.id})`,{peers:[],signals:[]};let a=Array.isArray(e.send)?e.send.slice(0,Ne):[];for(let m of a){let l=m?.to,w=m?.data;if(typeof l!="string"||!Pe.test(l)||l===t.id||typeof w!="object"||w===null)continue;let h=JSON.stringify(w);h.length>Oe||await i`
      insert into typlympics.voice_signals (pin, from_id, to_id, data)
      select ${n}, ${t.id}, m.athlete_id, ${h}::jsonb
      from typlympics.room_members m where m.pin = ${n} and m.athlete_id = ${l}`}let o=await i`
    delete from typlympics.voice_signals where pin = ${n} and to_id = ${t.id}
    returning id, from_id, data`;return o.sort((m,l)=>Number(m.id)-Number(l.id)),await i`delete from typlympics.voice_signals where created_at < now() - interval '1 minute'`,{peers:(await i`
    select athlete_id from typlympics.room_members
    where pin = ${n} and athlete_id <> ${t.id} and voice_at > now() - make_interval(secs => ${Ee})`).map(m=>m.athlete_id),signals:o.map(m=>({from:m.from_id,data:typeof m.data=="string"?JSON.parse(m.data):m.data}))}}var Le={enter:he,host:_e,join:ge,room:be,leave:ke,start:Re,tick:$e,submit:Se,results:Me,records:Te,weekly:Ie,hall:xe,myMedals:Ae,voice:Ce};function g(e,t){return new Response(JSON.stringify(t),{status:e,headers:{...j,"Content-Type":"application/json"}})}Deno.serve(async e=>{if(e.method==="OPTIONS")return new Response("ok",{headers:j});if(e.method!=="POST")return g(405,{error:{code:"method",message:"Use POST."}});try{let t=await e.json(),n=Le[String(t.action)];if(!n)throw new c("bad_action","Unknown action.");return g(200,{ok:!0,...await n(t)})}catch(t){return t instanceof c?g(t.status,{ok:!1,error:{code:t.code,message:t.message}}):(console.error("typlympics function error",t),g(500,{ok:!1,error:{code:"server",message:"Something went wrong on the server."}}))}});
