-- Widen vacancy enums:
--  • role_type gains 'non_trade' — office/support roles (admin, accounts, ops)
--    that trade businesses also hire for.
--  • employment_type gains 'subcontract' — ABN subcontractor arrangements,
--    distinct from a plain employment 'contract' in the trades.
ALTER TABLE trade_vacancies
  DROP CONSTRAINT trade_vacancies_role_type_check,
  ADD CONSTRAINT trade_vacancies_role_type_check
    CHECK (role_type IN ('apprentice','qualified','senior_advisory','non_trade')),
  DROP CONSTRAINT trade_vacancies_employment_type_check,
  ADD CONSTRAINT trade_vacancies_employment_type_check
    CHECK (employment_type IS NULL OR employment_type IN ('full_time','part_time','casual','contract','subcontract','apprenticeship'));
