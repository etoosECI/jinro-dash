/* ===========================================================
   store.js — 학생 개별 데이터 저장 (가명 ID · 이 브라우저에만)
   개인정보 원칙: 실명·학번 저장 금지, 생기부 원문은 기본 미저장,
   언제든 전체 삭제 가능.
   =========================================================== */
(function (global) {
  'use strict';
  const KEY = 'jinro.profiles.v4';
  const THEME_KEY = 'jinro.theme';
  const LAST_KEY = 'jinro.lastProfile';

  const SYL = ['별빛', '푸른', '하늘', '단단', '고요', '맑은', '너른', '깊은', '새벽', '한결', '바람', '무늬'];

  function newId() {
    const a = SYL[Math.floor(Math.random() * SYL.length)];
    const b = Math.random().toString(16).slice(2, 6);
    return a + '-' + b;
  }

  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch (e) { Core.banner('warn', '저장된 데이터를 읽지 못했습니다', '형식이 손상되어 새로 시작합니다.'); return {}; }
  }
  function writeAll(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); return true; }
    catch (e) {
      Core.banner('warn', '브라우저에 저장하지 못했습니다', '저장 공간이 가득 찼거나 시크릿 모드일 수 있습니다. 리포트를 인쇄/PDF로 남겨 두세요.');
      return false;
    }
  }

  function blank(id) {
    return {
      profileVersion: '4.1',
      studentKey: id,
      schoolId: null, schoolName: null, schoolPath: null,
      trackId: null,
      entryGrade: null,          // 2 = 2학년 진입, 3 = 3학년 진입
      majorId: null,
      takenSubjects: [],         // 3학년 진입 시 2학년 이수과목 (고정)
      takenLocked: false,
      chosenSubjects: [],        // 이번에 설계한 선택 과목
      manualSubjects: [],        // 공동교육과정·전문교과 등 직접 추가한 과목
      programId: null,           // 세부 학과 (선택)
      topicIdx: {},              // 과목별 탐구 주제 로테이션 위치
      record: null,              // { consent, guardianConsent, rawStored, summary, diagnosis, at }
      history: [],
      createdAt: Core.nowKST(),
      updatedAt: Core.nowKST(),
    };
  }

  const Store = {
    newId,
    list() { return Object.keys(readAll()).sort(); },
    get(id) { return readAll()[id] || null; },
    exists(id) { return !!readAll()[id]; },
    blank,

    save(profile) {
      if (!profile || !profile.studentKey) return false;
      const all = readAll();
      profile.updatedAt = Core.nowKST();
      all[profile.studentKey] = profile;
      const ok = writeAll(all);
      if (ok) { try { localStorage.setItem(LAST_KEY, profile.studentKey); } catch (e) {} }
      return ok;
    },

    remove(id) {
      const all = readAll();
      delete all[id];
      writeAll(all);
    },

    log(profile, step, detail) {
      if (!profile) return;
      profile.history = profile.history || [];
      const last = profile.history[profile.history.length - 1];
      if (last && last.step === step && last.detail === detail) return;   // 중복 억제
      profile.history.push({ step, detail: detail || '', at: Core.nowKST() });
      if (profile.history.length > 200) profile.history = profile.history.slice(-200);
    },

    lastUsed() { try { return localStorage.getItem(LAST_KEY); } catch (e) { return null; } },
    theme: {
      get() { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; } },
      set(t) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} },
    },
  };

  global.Store = Store;
})(window);
