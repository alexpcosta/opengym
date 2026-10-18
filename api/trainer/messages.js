/* Push notification text for the trainer module, in every UI language the app ships.
 *
 * Pushes are composed on the server, which has no access to the frontend's string packs, so
 * the handful of sentences they need live here. The recipient's own `S.lang` picks the
 * language — a trainer reading in Portuguese gets Portuguese even when the student uses the
 * app in Spanish. Unknown languages fall back to English.
 */
const M = {
  en: {
    doneT: '{name} finished {routine}', doneB: '{dur} · {sets} sets · {vol}',
    prT: '🏆 {name}: new record', missedT: '{name} skipped {routine}', missedB: 'It was planned for today and nothing was logged.',
    planT: 'Your trainer updated your plan', planB: 'Open the app to see your new routines.',
    dietT: 'Your trainer updated your diet', dietB: 'Open the app to see your meals and targets.',
    dietMissingT: '{name} logged no food today', dietMissingB: 'The food diary is empty for today.',
    dietOffT: '{name} was off target today', dietOffB: '{kcal} / {target} kcal · protein {p} / {pt} g',
    summaryT: 'Diet today', summaryB: '{n} students: {ok} on target · {off} off · {none} not logged',
    suppT: 'Your trainer updated your supplements', suppB: 'Open the app to see what to take and when.',
    suppNoneT: '{name} marked no supplements today', suppNoneB: '{due} doses were due and none were ticked.',
    suppPartT: '{name} missed a supplement dose', suppPartB: '{taken} of {due} doses marked · missing: {names}',
    freestyle: 'a workout'
  },
  de: {
    doneT: '{name} hat {routine} beendet', doneB: '{dur} · {sets} Sätze · {vol}',
    prT: '🏆 {name}: neuer Rekord', missedT: '{name} hat {routine} ausgelassen', missedB: 'Für heute geplant, nichts eingetragen.',
    planT: 'Dein Trainer hat deinen Plan aktualisiert', planB: 'Öffne die App, um deine neuen Routinen zu sehen.',
    dietT: 'Dein Trainer hat deine Ernährung aktualisiert', dietB: 'Öffne die App, um Mahlzeiten und Ziele zu sehen.',
    dietMissingT: '{name} hat heute keine Mahlzeit eingetragen', dietMissingB: 'Das Ernährungstagebuch ist heute leer.',
    dietOffT: '{name} lag heute neben dem Ziel', dietOffB: '{kcal} / {target} kcal · Eiweiß {p} / {pt} g',
    summaryT: 'Ernährung heute', summaryB: '{n} Schüler: {ok} im Ziel · {off} daneben · {none} ohne Eintrag',
    suppT: 'Dein Trainer hat deine Supplemente aktualisiert', suppB: 'Öffne die App, um zu sehen, was wann genommen wird.',
    suppNoneT: '{name} hat heute keine Supplemente markiert', suppNoneB: '{due} Dosen waren fällig, keine wurde markiert.',
    suppPartT: '{name} hat eine Dosis nicht markiert', suppPartB: '{taken} von {due} Dosen markiert · fehlt: {names}',
    freestyle: 'ein Training'
  },
  es: {
    doneT: '{name} terminó {routine}', doneB: '{dur} · {sets} series · {vol}',
    prT: '🏆 {name}: nuevo récord', missedT: '{name} no hizo {routine}', missedB: 'Estaba planificado para hoy y no registró nada.',
    planT: 'Tu entrenador actualizó tu plan', planB: 'Abre la app para ver tus nuevas rutinas.',
    dietT: 'Tu entrenador actualizó tu dieta', dietB: 'Abre la app para ver tus comidas y metas.',
    dietMissingT: '{name} no registró comidas hoy', dietMissingB: 'El diario de alimentación está vacío hoy.',
    dietOffT: '{name} quedó fuera de la meta hoy', dietOffB: '{kcal} / {target} kcal · proteína {p} / {pt} g',
    summaryT: 'Dieta de hoy', summaryB: '{n} alumnos: {ok} en la meta · {off} fuera · {none} sin registro',
    suppT: 'Tu entrenador actualizó tus suplementos', suppB: 'Abre la app para ver qué tomar y cuándo.',
    suppNoneT: '{name} no marcó suplementos hoy', suppNoneB: 'Tocaban {due} tomas y no marcó ninguna.',
    suppPartT: '{name} se saltó una toma', suppPartB: '{taken} de {due} tomas marcadas · falta: {names}',
    freestyle: 'un entrenamiento'
  },
  fr: {
    doneT: '{name} a terminé {routine}', doneB: '{dur} · {sets} séries · {vol}',
    prT: '🏆 {name} : nouveau record', missedT: '{name} a sauté {routine}', missedB: 'Prévu aujourd’hui, rien d’enregistré.',
    planT: 'Ton coach a mis à jour ton programme', planB: 'Ouvre l’app pour voir tes nouvelles routines.',
    dietT: 'Ton coach a mis à jour ton alimentation', dietB: 'Ouvre l’app pour voir tes repas et objectifs.',
    dietMissingT: '{name} n’a noté aucun repas aujourd’hui', dietMissingB: 'Le journal alimentaire est vide aujourd’hui.',
    dietOffT: '{name} était hors objectif aujourd’hui', dietOffB: '{kcal} / {target} kcal · protéines {p} / {pt} g',
    summaryT: 'Alimentation du jour', summaryB: '{n} élèves : {ok} dans l’objectif · {off} hors objectif · {none} sans saisie',
    suppT: 'Ton coach a mis à jour tes compléments', suppB: 'Ouvre l’app pour voir quoi prendre et quand.',
    suppNoneT: '{name} n’a coché aucun complément aujourd’hui', suppNoneB: '{due} prises étaient prévues, aucune cochée.',
    suppPartT: '{name} a oublié une prise', suppPartB: '{taken} prises sur {due} · manque : {names}',
    freestyle: 'une séance'
  },
  it: {
    doneT: '{name} ha completato {routine}', doneB: '{dur} · {sets} serie · {vol}',
    prT: '🏆 {name}: nuovo record', missedT: '{name} ha saltato {routine}', missedB: 'Era in programma oggi e non è stato registrato nulla.',
    planT: 'Il tuo allenatore ha aggiornato il tuo piano', planB: 'Apri l’app per vedere le nuove routine.',
    dietT: 'Il tuo allenatore ha aggiornato la tua dieta', dietB: 'Apri l’app per vedere pasti e obiettivi.',
    dietMissingT: '{name} non ha registrato pasti oggi', dietMissingB: 'Il diario alimentare di oggi è vuoto.',
    dietOffT: '{name} oggi era fuori obiettivo', dietOffB: '{kcal} / {target} kcal · proteine {p} / {pt} g',
    summaryT: 'Dieta di oggi', summaryB: '{n} allievi: {ok} nell’obiettivo · {off} fuori · {none} senza registro',
    suppT: 'Il tuo allenatore ha aggiornato i tuoi integratori', suppB: 'Apri l’app per vedere cosa prendere e quando.',
    suppNoneT: '{name} non ha segnato integratori oggi', suppNoneB: 'Erano previste {due} dosi e non ne è stata segnata nessuna.',
    suppPartT: '{name} ha saltato una dose', suppPartB: '{taken} dosi su {due} · manca: {names}',
    freestyle: 'un allenamento'
  },
  pt: {
    doneT: '{name} concluiu {routine}', doneB: '{dur} · {sets} séries · {vol}',
    prT: '🏆 {name}: novo recorde', missedT: '{name} não fez {routine}', missedB: 'Estava planeado para hoje e nada foi registado.',
    planT: 'O teu treinador atualizou o teu plano', planB: 'Abre a app para ver as novas rotinas.',
    dietT: 'O teu treinador atualizou a tua dieta', dietB: 'Abre a app para ver as refeições e metas.',
    dietMissingT: '{name} não registou refeições hoje', dietMissingB: 'O diário alimentar de hoje está vazio.',
    dietOffT: '{name} ficou fora da meta hoje', dietOffB: '{kcal} / {target} kcal · proteína {p} / {pt} g',
    summaryT: 'Dieta de hoje', summaryB: '{n} alunos: {ok} na meta · {off} fora · {none} sem registo',
    suppT: 'O teu treinador atualizou os teus suplementos', suppB: 'Abre a app para ver o que tomar e quando.',
    suppNoneT: '{name} não marcou suplementos hoje', suppNoneB: 'Estavam previstas {due} tomas e nenhuma foi marcada.',
    suppPartT: '{name} falhou uma toma', suppPartB: '{taken} de {due} tomas marcadas · falta: {names}',
    freestyle: 'um treino'
  },
  pl: {
    doneT: '{name} ukończył(a) {routine}', doneB: '{dur} · {sets} serii · {vol}',
    prT: '🏆 {name}: nowy rekord', missedT: '{name} pominął(-ęła) {routine}', missedB: 'Zaplanowane na dziś, nic nie zapisano.',
    planT: 'Twój trener zaktualizował Twój plan', planB: 'Otwórz aplikację, aby zobaczyć nowe rutyny.',
    dietT: 'Twój trener zaktualizował Twoją dietę', dietB: 'Otwórz aplikację, aby zobaczyć posiłki i cele.',
    dietMissingT: '{name} nie zapisał(a) dziś posiłków', dietMissingB: 'Dzisiejszy dziennik jedzenia jest pusty.',
    dietOffT: '{name} był(a) dziś poza celem', dietOffB: '{kcal} / {target} kcal · białko {p} / {pt} g',
    summaryT: 'Dieta dzisiaj', summaryB: '{n} podopiecznych: {ok} w celu · {off} poza · {none} bez wpisu',
    suppT: 'Twój trener zaktualizował Twoje suplementy', suppB: 'Otwórz aplikację, aby zobaczyć co i kiedy przyjmować.',
    suppNoneT: '{name} nie zaznaczył(a) dziś suplementów', suppNoneB: 'Zaplanowano {due} dawek, nie zaznaczono żadnej.',
    suppPartT: '{name} pominął(-ęła) dawkę', suppPartB: 'Zaznaczono {taken} z {due} dawek · brakuje: {names}',
    freestyle: 'trening'
  },
  tr: {
    doneT: '{name} {routine} antrenmanını bitirdi', doneB: '{dur} · {sets} set · {vol}',
    prT: '🏆 {name}: yeni rekor', missedT: '{name} {routine} antrenmanını atladı', missedB: 'Bugün için planlanmıştı, hiçbir şey kaydedilmedi.',
    planT: 'Antrenörün planını güncelledi', planB: 'Yeni rutinleri görmek için uygulamayı aç.',
    dietT: 'Antrenörün diyetini güncelledi', dietB: 'Öğünleri ve hedefleri görmek için uygulamayı aç.',
    dietMissingT: '{name} bugün yemek kaydetmedi', dietMissingB: 'Bugünkü beslenme günlüğü boş.',
    dietOffT: '{name} bugün hedefin dışında kaldı', dietOffB: '{kcal} / {target} kcal · protein {p} / {pt} g',
    summaryT: 'Bugünkü diyet', summaryB: '{n} öğrenci: {ok} hedefte · {off} dışında · {none} kayıtsız',
    suppT: 'Antrenörün takviyelerini güncelledi', suppB: 'Ne zaman ne alacağını görmek için uygulamayı aç.',
    suppNoneT: '{name} bugün hiç takviye işaretlemedi', suppNoneB: '{due} doz vardı, hiçbiri işaretlenmedi.',
    suppPartT: '{name} bir dozu kaçırdı', suppPartB: '{due} dozdan {taken} işaretlendi · eksik: {names}',
    freestyle: 'bir antrenman'
  },
  ru: {
    doneT: '{name} завершил(а) {routine}', doneB: '{dur} · {sets} подх. · {vol}',
    prT: '🏆 {name}: новый рекорд', missedT: '{name} пропустил(а) {routine}', missedB: 'Было запланировано на сегодня, ничего не записано.',
    planT: 'Тренер обновил твой план', planB: 'Открой приложение, чтобы увидеть новые программы.',
    dietT: 'Тренер обновил твой рацион', dietB: 'Открой приложение, чтобы увидеть приёмы пищи и цели.',
    dietMissingT: '{name} сегодня не записал(а) еду', dietMissingB: 'Дневник питания за сегодня пуст.',
    dietOffT: '{name} сегодня вне цели', dietOffB: '{kcal} / {target} ккал · белок {p} / {pt} г',
    summaryT: 'Питание сегодня', summaryB: 'Учеников: {n} — в цели {ok} · вне цели {off} · без записей {none}',
    suppT: 'Тренер обновил твои добавки', suppB: 'Открой приложение, чтобы увидеть, что и когда принимать.',
    suppNoneT: '{name} сегодня не отметил(а) добавки', suppNoneB: 'Запланировано приёмов: {due} — не отмечен ни один.',
    suppPartT: '{name} пропустил(а) приём', suppPartB: 'Отмечено {taken} из {due} · не хватает: {names}',
    freestyle: 'тренировку'
  },
  zh: {
    doneT: '{name} 完成了 {routine}', doneB: '{dur} · {sets} 组 · {vol}',
    prT: '🏆 {name}：新纪录', missedT: '{name} 未完成 {routine}', missedB: '今天有计划，但没有任何记录。',
    planT: '你的教练更新了你的计划', planB: '打开应用查看新的训练日程。',
    dietT: '你的教练更新了你的饮食', dietB: '打开应用查看餐食和目标。',
    dietMissingT: '{name} 今天没有记录饮食', dietMissingB: '今天的饮食日记是空的。',
    dietOffT: '{name} 今天未达成目标', dietOffB: '{kcal} / {target} 千卡 · 蛋白质 {p} / {pt} 克',
    summaryT: '今日饮食', summaryB: '{n} 名学员：{ok} 达标 · {off} 未达标 · {none} 未记录',
    suppT: '你的教练更新了你的补剂', suppB: '打开应用查看服用的内容和时间。',
    suppNoneT: '{name} 今天没有记录补剂', suppNoneB: '今天应服 {due} 次，一次也没有勾选。',
    suppPartT: '{name} 漏了一次补剂', suppPartB: '已勾选 {taken} / {due} 次 · 缺少：{names}',
    freestyle: '一次训练'
  },
  ko: {
    doneT: '{name}님이 {routine}을(를) 완료했어요', doneB: '{dur} · {sets}세트 · {vol}',
    prT: '🏆 {name}: 새 기록', missedT: '{name}님이 {routine}을(를) 건너뛰었어요', missedB: '오늘 계획되어 있었지만 기록이 없어요.',
    planT: '트레이너가 플랜을 업데이트했어요', planB: '앱을 열어 새 루틴을 확인하세요.',
    dietT: '트레이너가 식단을 업데이트했어요', dietB: '앱을 열어 식사와 목표를 확인하세요.',
    dietMissingT: '{name}님이 오늘 식사를 기록하지 않았어요', dietMissingB: '오늘 식단 일지가 비어 있어요.',
    dietOffT: '{name}님이 오늘 목표를 벗어났어요', dietOffB: '{kcal} / {target} kcal · 단백질 {p} / {pt} g',
    summaryT: '오늘의 식단', summaryB: '회원 {n}명: 목표 달성 {ok} · 이탈 {off} · 미기록 {none}',
    suppT: '트레이너가 보충제를 업데이트했어요', suppB: '앱을 열어 무엇을 언제 먹을지 확인하세요.',
    suppNoneT: '{name}님이 오늘 보충제를 체크하지 않았어요', suppNoneB: '{due}회 예정이었지만 하나도 체크하지 않았어요.',
    suppPartT: '{name}님이 보충제를 놓쳤어요', suppPartB: '{due}회 중 {taken}회 체크 · 누락: {names}',
    freestyle: '운동'
  },
  hi: {
    doneT: '{name} ने {routine} पूरा किया', doneB: '{dur} · {sets} सेट · {vol}',
    prT: '🏆 {name}: नया रिकॉर्ड', missedT: '{name} ने {routine} छोड़ दिया', missedB: 'आज के लिए योजना थी, कुछ भी दर्ज नहीं हुआ।',
    planT: 'आपके ट्रेनर ने आपका प्लान अपडेट किया', planB: 'नए रूटीन देखने के लिए ऐप खोलें।',
    dietT: 'आपके ट्रेनर ने आपकी डाइट अपडेट की', dietB: 'भोजन और लक्ष्य देखने के लिए ऐप खोलें।',
    dietMissingT: '{name} ने आज कोई भोजन दर्ज नहीं किया', dietMissingB: 'आज की फ़ूड डायरी खाली है।',
    dietOffT: '{name} आज लक्ष्य से बाहर रहे', dietOffB: '{kcal} / {target} kcal · प्रोटीन {p} / {pt} g',
    summaryT: 'आज की डाइट', summaryB: '{n} छात्र: {ok} लक्ष्य में · {off} बाहर · {none} दर्ज नहीं',
    suppT: 'आपके ट्रेनर ने आपके सप्लीमेंट अपडेट किए', suppB: 'क्या और कब लेना है, देखने के लिए ऐप खोलें।',
    suppNoneT: '{name} ने आज कोई सप्लीमेंट दर्ज नहीं किया', suppNoneB: 'आज {due} खुराक थीं, एक भी दर्ज नहीं हुई।',
    suppPartT: '{name} ने एक खुराक छोड़ दी', suppPartB: '{due} में से {taken} खुराक दर्ज · बाकी: {names}',
    freestyle: 'एक वर्कआउट'
  }
};

const LOCALES = {
  en: 'en-GB', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt: 'pt-PT',
  pl: 'pl-PL', tr: 'tr-TR', ru: 'ru-RU', zh: 'zh-CN', ko: 'ko-KR', hi: 'hi-IN'
};

export const LANGS = Object.keys(M);

/** Message `key` in `lang` with {placeholders} filled; English when the language or key is missing. */
export function msg(lang, key, vars = {}) {
  const pack = M[lang] || M.en;
  const s = pack[key] ?? M.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

export function fmtNum(lang, n) {
  try { return (Math.round(n * 10) / 10).toLocaleString(LOCALES[lang] || 'en-GB'); }
  catch { return String(Math.round(n * 10) / 10); }
}

/** "52 min" or "1h 05m" — numerals and unit letters read the same in every language here. */
export function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
}
