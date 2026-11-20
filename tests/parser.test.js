/* Parser checks for Interval Clock. Run from any folder:  node ~/tools/intervals/tests/parser.test.js
   It takes the parser from index.html (between //PARSER-START and //PARSER-END) and checks:
   - parser-baseline.json: 27 valid inputs and the plans they gave when this file was made (20 Nov, the parser of
     264dba1). They must still give the same plan, with no notes or warnings. If a change is meant to alter one,
     replace that entry by hand and say why in the commit.
   - typo slips read the same as the clean form, unread numbers are reported, group repeats match the plan
     written out in full, and each explanation's line times add up to the total.
   Exits 1 if anything fails. No dependencies beyond Node. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('//PARSER-START'),html.indexOf('//PARSER-END'));
const P=vm.createContext({});vm.runInContext(src+';this.parsePlan=parsePlan;this.durTxt=durTxt;',P);
const {parsePlan,durTxt}=P;

let fails=0,passes=0;
function check(ok,what){if(ok)passes++;else{fails++;console.log('FAIL',what)}}
const sig=t=>parsePlan(t).intervals.map(i=>i.kind[0]+i.secs).join(' ');
const plan=t=>parsePlan(t).intervals.map(i=>[i.secs,i.kind,i.label,i.tags.join('|')]);

// 1. Baseline: valid inputs keep their plan and get no notes.
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'parser-baseline.json'),'utf8'));
for(const [t,want] of Object.entries(base)){
  check(JSON.stringify(plan(t))===JSON.stringify(want),`baseline plan changed: ${t}`);
  const r=parsePlan(t);
  check(!r.read&&!r.notes.length&&!r.ignored.length&&!r.errors.length,`baseline got a note or warning: ${t}`);
}

// 2. Typos read the same as the clean form (the first of each list).
const same=[
  ['4-10-5','4--10-5','4-10--5','4-10-5-','4 - 10 - 5','4 -10-5','4---10-5','-4-10-5'],
  ['6-10-8/4-10-8','6-10-8//4-10-8','6-10-8/4-10-8-','6-10-8-/4-10-8','6-10-8/-4-10-8','6-10-8/4-10-8/','6-10-8 // 4-10-8','6-10-8;4-10-8'],
  ['5-12-30:2','5-12-30::2','5-12-30 :2','5-12-30: 2','5-12-30-:2','5-12-30:-2','5-12-30:2:','5-12-30;2','5-12-30 x2',
   '5-12-30x 2','5-12-30xx2','5-12-30X2','5-12-30*2','5-12-30 ; 2','5-12-30 x x 2','5-12-30x2'],
  ['5-12-30','5-12-30x','5-12-30:'],
];
for(const g of same)for(const t of g.slice(1)){
  check(sig(t)===sig(g[0]),`"${t}" should read as "${g[0]}"`);
  check(!parsePlan(t).ignored.length,`"${t}" should leave nothing unread`);
}
// Interior fixes are reported; trailing ones (from typing) are not.
check(parsePlan('4--10-5').read==='4-10-5','"4--10-5" says Read as 4-10-5');
check(parsePlan('5-12-30;2').read==='5-12-30:2','"5-12-30;2" says Read as 5-12-30:2');
check(parsePlan('4-10-5-').read==='','a trailing dash gets no note');
check(parsePlan('5-12-30x').read==='','a half-typed x gets no note');

// 3. Numbers the parser can't use are reported, not dropped.
for(const t of ['4-1o-5','4.10.5','12xx10s','6-10/8','10 pushups 30s'])check(parsePlan(t).ignored.length>0,`"${t}" should report ignored text`);
check(parsePlan('4-1o-5').lines[0].text==='4s work','unread text stays out of the interval name');

// 4. Group repeats match the plan written out in full.
const reps=[['5-12-30:2','10-12-30'],['5-12-30-60:2','5-12-30-60/5-12-30-60'],['5-12-30:2/4-2-10:4','5-12-30/5-12-30/4-2-10/4-2-10/4-2-10/4-2-10'],
  ['4-10-1:30','4-10-90'],['5-12-30:1','5-12-30'],['3-20-10x12','36-20-10']];
for(const [a,b] of reps)check(sig(a)===sig(b),`"${a}" should equal "${b}"`);
check(parsePlan('5-12-30:2/4-2-10:4').intervals[11].tags.join(' · ')==='Group 1/2 · Repeat 2/2 · Set 1/5','repeat passes are tagged');

// 5. Valid but easy-to-mistake readings get a note.
check(/30 min 12 s/.test(parsePlan('5-12-30:12').notes[0]||''),'a colon time of 10+ min in a group is noted');
check(/rounded to 30s/.test(parsePlan('5-12-30.2').notes[0]||''),'a rounded decimal is noted');
check(!parsePlan('4-10-1:30').notes.length,'a short colon time gets no note');

// 6. Explanation lines add up to the total, for every input above.
const all=new Set([...Object.keys(base),...same.flat(),...reps.flat()]);
for(const t of all){
  const r=parsePlan(t),tot=r.intervals.reduce((a,b)=>a+b.secs,0),sum=r.lines.reduce((a,b)=>a+b.secs,0);
  check(tot===sum,`explanation of "${t}" adds to ${durTxt(sum)}, plan is ${durTxt(tot)}`);
}
check(parsePlan('6-10-8/4-10-8').lines.map(l=>l.text).join(' | ')==='6 rounds · 10s work · 8s rest | 4 rounds · 10s work · 8s rest','explanation wording');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails?1:0);
