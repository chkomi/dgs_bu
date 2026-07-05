-- 사업자 정보를 프로필에 저장해 주문 시 자동 입력(프리필)에 사용
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS business_info JSONB;
