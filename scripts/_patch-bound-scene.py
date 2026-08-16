from pathlib import Path

p = Path('src/js/features/home/home-workbench-panels.js')
text = p.read_text(encoding='utf-8')
old = """    host.innerHTML=html;
    var manage=$('wbHabitManage');
    if(manage){
      manage.textContent=t('homeWbHabitManage','管理');
      manage.setAttribute('data-wb-habit-open-hub',active&&active.id?String(active.id):'');
    }
    if(rules&&rules.prefetchMappingRuleIcons){
      items.forEach(function(m){ rules.prefetchMappingRuleIcons(m); });
    }
  }

  function buildHomeMicBars(count){"""
new = """    host.innerHTML=html;
    var manage=$('wbHabitManage');
    if(manage){
      manage.textContent=t('homeWbHabitManage','管理');
      manage.setAttribute('data-wb-habit-open-hub',active&&active.id?String(active.id):'');
    }
    var boundScene=$('wbContextBoundScene');
    if(boundScene){
      var shortName=active?sceneChipShortName(active):'';
      if(shortName){
        boundScene.hidden=false;
        boundScene.textContent=shortName;
      }else{
        boundScene.hidden=true;
        boundScene.textContent='—';
      }
    }
    var boundTitle=$('wbContextBoundTitle');
    if(boundTitle) boundTitle.textContent=t('homeWbContextBoundTitle','当前习惯');
    if(rules&&rules.prefetchMappingRuleIcons){
      items.forEach(function(m){ rules.prefetchMappingRuleIcons(m); });
    }
  }

  function buildHomeMicBars(count){"""
if old not in text:
    raise SystemExit('block not found')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
print('ok panels')
