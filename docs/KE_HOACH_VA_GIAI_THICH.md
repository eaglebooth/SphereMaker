# Ke hoach va giai thich Sphere Maker

## Muc tieu san pham

Sphere Maker la mot agent market maker tu dong cho Unicity Testnet v2. San pham khong chi la dashboard vi. No la mot agent co policy rieng, tu quan sat thi truong, tu dat lenh mua/ban, tu danh gia doi tac va tu thuc hien swap neu giao dich nam trong gioi han rui ro.

## Ke hoach build

### Giai doan 1: MVP chay duoc

- Tao backend Express chay agent loop.
- Tao dashboard React de xem trang thai va dieu chinh policy.
- Tao dry-run adapter de reviewer chay duoc ngay.
- Tao live adapter rieng cho Sphere SDK Testnet v2.

### Giai doan 2: Ket noi Unicity that

- Cau hinh mnemonic/nametag testnet.
- Kiem tra balances bang `sphere.payments.getAssets()`.
- Dang market intent bang module `sphere.market`.
- De xuat swap bang module `sphere.swap`.
- Tu settle swap neu policy bat `autoSettle`.

### Giai doan 3: Nang cap de an diem cao hon

- Them doi tac demo bot de tao counter-intents that.
- Them history persistence bang SQLite/Postgres.
- Them AstridOS runner: chi cho agent quyen dung dung so tien, token va action duoc phep.
- Them strategy nang cao: inventory skew, volatility spread, stop-loss.

## Cach hoat dong de hieu

Hay tuong tuong Sphere Maker la mot nguoi doi tien tu dong trong cho Unicity.

## Vi sao khong phai nut connect vi browser thong thuong?

Voi mot dApp binh thuong, nguoi dung bam "Connect Wallet" roi bam xac nhan tung giao dich. Nhưng voi Autonomous Liquidity/Swap Agent, cach do se lam mat tinh autonomous, vi agent se dung lai moi khi can nguoi xac nhan.

Vì vậy Sphere Maker dung **agent wallet**:

- O che do dry-run: vi duoc mo phong de demo ngay.
- O che do live: vi agent duoc nap tu `.env` bang `SPHERE_AGENT_MNEMONIC`.
- Dashboard chi hien thi trang thai ket noi, nametag, network, wallet-api session va public address.
- Mnemonic/private key khong bao gio duoc gui len frontend.

Neu reviewer hoi "connect vi o dau?", cau tra loi la: nut/panel **Agent Wallet** tren dashboard cho biet vi agent dang o dry-run hay live. De connect vi that, cau hinh `.env`, sau do backend agent se tu load vi va tiep tuc chay ke ca khi khong mo trinh duyet.

Nguoi dung khong bam nut mua/ban tung lan. Nguoi dung chi noi:

- Gia tham chieu hien tai la bao nhieu.
- Moi lenh duoc giao dich toi da bao nhieu.
- Agent duoc giu toi da/toi thieu bao nhieu UCT.
- Gia lech toi da bao nhieu thi van chap nhan.
- Co duoc tu settle giao dich hay khong.

Sau do agent tu lam viec theo vong lap:

1. Kiem tra minh dang co bao nhieu UCT va ETH.
2. Tao gia mua thap hon gia tham chieu mot chut.
3. Tao gia ban cao hon gia tham chieu mot chut.
4. Dang hai intent len market.
5. Doc cac intent cua nguoi/agent khac.
6. Neu thay ai ban re trong gioi han, agent de xuat mua.
7. Neu thay ai mua cao trong gioi han, agent de xuat ban.
8. Neu giao dich khong pha vo gioi han ton kho va slippage, agent settle.
9. Ghi lai ly do moi quyet dinh vao audit log.

Vi vay diem hay cua san pham la: agent co the tu tao thanh khoan cho thi truong, nhung khong duoc vuot qua bien an toan do nguoi dung dat ra.

## Diem phu hop voi Builder Program

- Dung track Payments and markets vi co market intents va swaps.
- Co tinh autonomous vi agent tu quote, tu chon counterparty va tu settle.
- Co value movement vi live mode duoc thiet ke de di qua Sphere SDK payments/swap primitives.
- Co UI public de reviewer thay agent dang lam gi.
- Co audit trail de chung minh day la agent co quyet dinh, khong phai UI cosmetic.
