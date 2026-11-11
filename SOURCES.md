# 資料來源與授權紀錄

核對日期：2026-11-10。此文件記錄上游公開授權聲明與本版使用範圍，並非對全部上游來源權利鏈作獨立法律保證。

## 已納入

- 名稱：Rime Cantonese，維護者 CanCLID（Cantonese Computational Linguistics Infrastructure Development Workgroup）及上游貢獻者。
- 官方倉庫：https://github.com/rime/rime-cantonese
- 上游聲明：https://github.com/rime/rime-cantonese/blob/main/README-en.md
- 授權：主體 CC BY 4.0；容許分享、修改及商業利用，須合理署名、提供授權連結、註明修改且不得暗示背書。授權全文隨附於 licenses/Rime-CC-BY-4.0.txt。官方授權：https://creativecommons.org/licenses/by/4.0/
- 使用檔案：jyut6ping3.words.dict.yaml、jyut6ping3.chars.dict.yaml。實際固定提交、SHA-256、收錄筆數見 data/provenance.json。
- 修改：抽取漢字詞形及粵拼，保留一字一音節且聲調為 1–6 的紀錄，去除同詞同音重複；不更改詞形讀音。轉成 JSON 包裝於 JS，以便直接開啟離線網頁。數字編碼由使用者映射即時計算。
- 詞庫屬輸入法字詞表，包含書面詞、專名、異體及多音；詞條出現並不等於日常粵語常用度或詞義已人工核實。

## 核對但未納入

- jyut6ping3.maps：上游另行指定 ODbL 1.0，未混入本版。
- jyut6ping3.phrase 與 lettered：未納入；phrase 檔頭列出多個參考來源，將來擴充須逐項評估資料來源及再分發條件。
- Words.hk／粵典：https://words.hk/ 。本版未直接下載或抓取其資料；沒有將網站可瀏覽視作開放再分發授權。未使用第三方聲稱的授權替代官方可核實條款。
- CC-Canto：http://www.cccanto.org/ 。本版未直接整合；日後整合須核對具體下載版本及 CC BY-SA 等適用條件，另行保留署名與衍生資料授權。
- 0243.hk：未抓取或再分發。

網頁頁腳持續提供署名、授權與版本連結。分詞結果是原有詞條的組合，不是原詞庫收錄整句的證明。使用者輸入的示例不是新增詞條。

## 簡繁轉換資料

- OpenCC（Open Chinese Convert），作者 BYVoid 及貢獻者：https://github.com/BYVoid/OpenCC 。
- 使用官方 TSCharacters、TSPhrases、STCharacters、STPhrases 四張字表，檔頭指定 Apache-2.0。保留授權全文 licenses/OpenCC-Apache-2.0.txt 及作者清單 licenses/OpenCC-AUTHORS.txt。
- 修改：取每項第一候選、僅保留等長轉換、轉成 JS 包裝。使用自行實作的最長詞組匹配，未聲稱完整重現 OpenCC 各地區配置。資料固定版本及 SHA-256 見 data/variants-provenance.json。
- 原粵語詞庫詞形和粵拼不變；只轉換顯示及草稿，鎖定兼容簡繁單字。簡繁合併字可能對應多個原詞條，轉換本身不新增讀音。

## 詞頻與共現：HKCanCor

- 香港粵語語料庫（HKCanCor），K. K. Luke 與 May L. Y. Wong（2015），*The Hong Kong Cantonese Corpus: Design and Uses*，Journal of Chinese Linguistics 43(2), 309–330。上游：https://github.com/fcbond/hkcancor 。
- 上游 `data/LICENSE` 為 CC BY 4.0，隨附副本 `licenses/HKCanCor-CC-BY-4.0.txt`；授權條款：https://creativecommons.org/licenses/by/4.0/ 。提交與逐檔雜湊見 `data/corpus-provenance.json`。
- 取 UTF-8 轉寫的漢字分詞資料，不分發原錄音或完整對話。抽取詞形與同讀音次數、最常見詞性、相鄰詞對及 PPMI 共現，產生本地查詢索引 `data/corpus.js`。語義查詢可按簡繁歸一，候選顯示的詞次及整句詞對、詞三元組均按原字形核對。
- 固定版本得到 128,135 個漢字詞次、6,420 個原始詞形與 10,801 個話輪。這是樣本，不是現代全粵語的使用統計，也沒有歌詞風格、情緒或詞義標註。風格規則由本 App 設定，與語料測量分開標示；無記錄不表示罕見。
- 整句搜尋另從同一固定版本提取 17,863 個去重短片段（按標點／話輪切分，保留漢字、粵拼與原詞性，略過標為人名的片段）。衍生資料 `data/clauses.js` 同樣附上 HKCanCor 署名及 CC BY 4.0 授權；不是歌詞庫，也不保證每段獨立成句。`scripts/build_clauses.py` 會先核對原檔雜湊。
- 多選詞性使用 `scripts/build_corpus.py` 從同一語料版本提取每個原字形的全部實際觀測詞性，轉成用戶可選分類。少量常用助詞以字表補充；查不到的詞標為未分類，不用詞形猜測完整詞性。
