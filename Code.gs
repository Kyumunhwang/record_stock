/**
 * 구글 스프레드시트가 열릴 때 실행되는 트리거 함수
 * 상단 툴바에 사용자 정의 메뉴를 생성합니다.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📈 주식 관리')
    .addItem('거래 기록 입력창 열기', 'showSidebar')
    .addItem('시트 초기 템플릿 구성', 'setupSheetTemplates')
    .addToUi();
}

/**
 * HTML 사이드바 UI를 화면 우측에 표시합니다.
 */
function showSidebar() {
  var html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('주식 거래 입력기')
    .setWidth(350);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * 초기 스프레드시트 구조(시트 생성 및 헤더 설정)를 세팅합니다.
 */
function setupSheetTemplates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Transactions 시트 세팅
  var txSheet = ss.getSheetByName('Transactions');
  if (!txSheet) {
    txSheet = ss.insertSheet('Transactions');
  }
  txSheet.clear();
  var txHeaders = [['거래 ID', '날짜', '종목명', '종목코드', '구분', '수량', '단가', '거래금액', '매매 이유']];
  txSheet.getRange(1, 1, 1, 9).setValues(txHeaders)
         .setBackground('#2E3B4E').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  txSheet.setFrozenRows(1);
  
  // 거래금액 자동 계산 수식 설정 (샘플 행)
  txSheet.getRange('H2').setFormula('=F2*G2');

  // 2. Portfolio 시트 세팅
  var portSheet = ss.getSheetByName('Portfolio');
  if (!portSheet) {
    portSheet = ss.insertSheet('Portfolio');
  }
  portSheet.clear();
  var portHeaders = [['종목코드', '종목명', '보유수량', '평균매수단가', '총 매수금액', '현재가', '평가금액', '평가손익', '수익률']];
  portSheet.getRange(1, 1, 1, 9).setValues(portHeaders)
           .setBackground('#1C2D42').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  portSheet.setFrozenRows(1);

  // Portfolio 수식 자동 완성 세팅 (100행까지 자동 매핑 설정)
  // UNIQUE 함수로 고유 코드 추출
  portSheet.getRange('A2').setFormula(`=UNIQUE(FILTER(Transactions!D2:D, Transactions!D2:D<>""))`);
  
  // 나머지 열에 대한 수식 배치
  portSheet.getRange('B2:B100').setFormula(`=IF(ISBLANK(A2), "", XLOOKUP(A2, Transactions!D:D, Transactions!C:C))`);
  portSheet.getRange('C2:C100').setFormula(`=IF(ISBLANK(A2), "", SUMIFS(Transactions!F:F, Transactions!D:D, A2, Transactions!E:E, "매수") - SUMIFS(Transactions!F:F, Transactions!D:D, A2, Transactions!E:E, "매도"))`);
  portSheet.getRange('D2:D100').setFormula(`=IF(ISBLANK(A2), "", IFERROR(SUMIFS(Transactions!H:H, Transactions!D:D, A2, Transactions!E:E, "매수") / SUMIFS(Transactions!F:F, Transactions!D:D, A2, Transactions!E:E, "매수"), 0))`);
  portSheet.getRange('E2:E100').setFormula(`=IF(ISBLANK(A2), "", C2*D2)`);
  
  // 현재가 수식: 한국 주식(숫자 6자리)은 네이버 실시간 API 커스텀 함수(NAVERPRICE)를 사용하고, 해외 주식은 GOOGLEFINANCE 사용
  portSheet.getRange('F2:F100').setFormula(`=IF(ISBLANK(A2), "", IF(ISNUMBER(VALUE(A2)), NAVERPRICE(A2), GOOGLEFINANCE(A2, "price")))`);
  
  portSheet.getRange('G2:G100').setFormula(`=IF(ISBLANK(A2), "", C2*F2)`);
  portSheet.getRange('H2:H100').setFormula(`=IF(ISBLANK(A2), "", G2-E2)`);
  portSheet.getRange('I2:I100').setFormula(`=IF(ISBLANK(A2), "", IFERROR(H2/E2, 0))`);

  // 서식 지정
  portSheet.getRange('I2:I100').setNumberFormat('0.00%');
  
  SpreadsheetApp.getUi().alert('초기 템플릿 설정이 완료되었습니다! "Transactions"와 "Portfolio" 시트가 생성되었습니다.');
}

/**
 * HTML UI에서 전달받은 새로운 거래 내역을 Transactions 시트에 추가합니다.
 * @param {Object} data - 거래 정보 데이터 객체
 */
function addTransaction(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Transactions');
  if (!sheet) {
    throw new Error('Transactions 시트를 찾을 수 없습니다. 상단 메뉴에서 초기 설정을 먼저 진행해주세요.');
  }

  // 거래 ID 생성 (현재 행 번호를 기반으로 유니크 ID 부여)
  var lastRow = sheet.getLastRow();
  var nextRow = lastRow + 1;
  var txId = 'TX-' + (10000 + nextRow);

  // 단가 및 수량 포맷 변환
  var qty = parseFloat(data.quantity);
  var price = parseFloat(data.price);
  
  // 새 거래 기록 작성
  var rowData = [
    txId,
    data.date,
    data.stockName,
    data.stockCode,
    data.type,      // 매수 or 매도
    qty,
    price,
    `=F${nextRow}*G${nextRow}`, // 거래금액 수식 자동 입력
    data.reason
  ];

  sheet.appendRow(rowData);
  return { success: true, txId: txId };
}

/**
 * 입력 편의성을 위해 기존 거래내역에 등록된 종목 리스트를 반환합니다.
 */
function getUniqueStocks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Transactions');
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var range = sheet.getRange(2, 3, lastRow - 1, 2); // C열(종목명), D열(종목코드)
  var values = range.getValues();
  
  var uniqueMap = {};
  for (var i = 0; i < values.length; i++) {
    var name = values[i][0];
    var code = values[i][1];
    if (code && !uniqueMap[code]) {
      uniqueMap[code] = name;
    }
  }

  // 배열로 가공
  var result = [];
  for (var code in uniqueMap) {
    result.push({ code: code, name: uniqueMap[code] });
  }
  return result;
}

/**
 * 실시간 주가 사전 조회를 위한 외부 API 통신 함수
 * 한국 주식은 네이버 실시간 시세 API를 사용하고, 해외 주식은 Yahoo Finance API를 사용하여 가져옵니다.
 */
function fetchCurrentPrice(stockCode) {
  try {
    var codeStr = stockCode.toString().trim();
    
    // 한국 주식 코드 판별 및 0 패딩 (숫자로만 이루어진 경우 6자리 맞춤)
    if (/^\d+$/.test(codeStr)) {
      while (codeStr.length < 6) {
        codeStr = "0" + codeStr;
      }
    }
    
    // 1. 한국 주식 코드 판별 (숫자 6자리)
    if (/^\d{6}$/.test(codeStr)) {
      var url = "https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:" + codeStr;
      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var json = JSON.parse(response.getContentText());
      if (json && json.result && json.result.areas && json.result.areas[0] && json.result.areas[0].datas && json.result.areas[0].datas[0]) {
        var price = json.result.areas[0].datas[0].nv; // nv: 현재가
        return { price: price, currency: 'KRW', success: true };
      }
    }
    
    // 2. 해외 주식 (Yahoo Finance API 호출)
    var ticker = codeStr;
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker;
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json = JSON.parse(response.getContentText());
    
    if (json.chart && json.chart.result && json.chart.result[0]) {
      var meta = json.chart.result[0].meta;
      var price = meta.regularMarketPrice;
      var currency = meta.currency;
      return { price: price, currency: currency, success: true };
    }
    
    return { success: false, message: '주가 정보를 찾을 수 없습니다.' };
  } catch (e) {
    return { success: false, message: '에러 발생: ' + e.message };
  }
}

/**
 * Portfolio 시트의 모든 종목에 대해 오늘 시세를 조회하여 현재가(F열)를 갱신합니다.
 */
function updatePortfolioPrices() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Portfolio');
    if (!sheet) {
      throw new Error('Portfolio 시트를 찾을 수 없습니다. 상단 메뉴에서 초기 설정을 먼저 진행해주세요.');
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: true, count: 0, message: '조회할 종목이 없습니다.' };
    }
    
    // A열(종목코드) 가져오기
    var range = sheet.getRange(2, 1, lastRow - 1, 1);
    var codes = range.getValues();
    
    var updatedCount = 0;
    var errors = [];
    
    for (var i = 0; i < codes.length; i++) {
      var stockCode = codes[i][0];
      if (!stockCode) continue;
      
      // 시세 조회
      var result = fetchCurrentPrice(stockCode);
      if (result && result.success) {
        // F열 (현재가)에 값 입력 (2행부터 시작하므로 인덱스는 i + 2)
        sheet.getRange(i + 2, 6).setValue(result.price);
        updatedCount++;
      } else {
        errors.push(stockCode + ": " + (result.message || '조회 실패'));
      }
    }
    
    return { 
      success: true, 
      count: updatedCount, 
      total: codes.filter(function(c) { return c[0]; }).length,
      errors: errors 
    };
  } catch (e) {
    return { success: false, message: '에러 발생: ' + e.message };
  }
}

/**
 * 네이버 금융에서 한국 주식의 실시간 현재가를 가져오는 구글 시트 전용 사용자 정의 함수입니다.
 * 시트 셀에서 =NAVERPRICE("005930") 형태로 직접 호출할 수 있으며 실시간 주가를 제공합니다.
 * @param {string} stockCode 6자리 종목코드 (예: "005930")
 * @return {number} 현재가
 * @customfunction
 */
function NAVERPRICE(stockCode) {
  if (!stockCode) return "";
  var codeStr = stockCode.toString().trim();
  while (codeStr.length < 6 && /^\d+$/.test(codeStr)) {
    codeStr = "0" + codeStr; // 앞자리 0 자동 패딩
  }
  try {
    var url = "https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:" + codeStr;
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json = JSON.parse(response.getContentText());
    if (json && json.result && json.result.areas && json.result.areas[0] && json.result.areas[0].datas && json.result.areas[0].datas[0]) {
      return json.result.areas[0].datas[0].nv;
    }
    return "N/A";
  } catch (e) {
    return "에러: " + e.message;
  }
}
