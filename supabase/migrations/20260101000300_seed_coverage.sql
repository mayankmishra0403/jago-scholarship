-- Seed the eligible-student universe for the Ministry coverage dashboard.
--
-- In production this table is populated by the nightly UDISE+, AISHE and OTR
-- sync. For the SIH prototype we generate a deterministic cohort so the
-- dashboard and the unreached-beneficiary targeting demo have real numbers to
-- work on. Every decision is derived from `hashtext` of a fixed string, so
-- re-running the migration produces byte-identical rows.

create temporary table seed_state (
  state_ut text primary key,
  enrolled integer,
  pvtg_share numeric,
  otr_rate numeric,
  median_income integer
) on commit drop;

insert into seed_state values
  ('Odisha',          412000, 0.223, 0.612, 145000),
  ('Jharkhand',       286000, 0.198, 0.534, 138000),
  ('Madhya Pradesh',  198000, 0.151, 0.441, 132000),
  ('Chhattisgarh',    164000, 0.286, 0.398, 128000),
  ('Gujarat',         121000, 0.089, 0.671, 165000),
  ('Maharashtra',     118000, 0.094, 0.723, 178000),
  ('Rajasthan',       109000, 0.132, 0.512, 152000),
  ('Karnataka',        98000, 0.101, 0.706, 171000),
  ('West Bengal',      96000, 0.078, 0.588, 149000),
  ('Uttar Pradesh',    92000, 0.014, 0.474, 141000),
  ('Telangana',        74000, 0.164, 0.694, 163000),
  ('Kerala',           21000, 0.018, 0.802, 189000),
  ('Himachal Pradesh',  9000, 0.026, 0.718, 172000);

create temporary table seed_district (
  state_ut text not null,
  district text not null,
  weight numeric not null,
  primary key (state_ut, district)
) on commit drop;

insert into seed_district values
  ('Odisha','Sambalpur',0.19),   ('Odisha','Balangir',0.16),
  ('Odisha','Kalahandi',0.14),   ('Odisha','Koraput',0.13),
  ('Odisha','Rayagada',0.12),    ('Odisha','Mayurbhanj',0.14),
  ('Odisha','Ganjam',0.12),
  ('Jharkhand','Ranchi',0.24),   ('Jharkhand','Dhanbad',0.19),
  ('Jharkhand','Chatra',0.15),   ('Jharkhand','Gumla',0.14),
  ('Jharkhand','Khunti',0.14),   ('Jharkhand','Ramgarh',0.14),
  ('Madhya Pradesh','Dindori',0.16), ('Madhya Pradesh','Jabalpur',0.22),
  ('Madhya Pradesh','Bhopal',0.24),   ('Madhya Pradesh','Shahdol',0.19),
  ('Madhya Pradesh','Mandla',0.19),
  ('Chhattisgarh','Bastar',0.21),     ('Chhattisgarh','Dantewada',0.18),
  ('Chhattisgarh','Kanker',0.17),     ('Chhattisgarh','Jashpur',0.16),
  ('Chhattisgarh','Raipur',0.16),     ('Chhattisgarh','Korba',0.12),
  ('Gujarat','Dahod',0.28),           ('Gujarat','Narmada',0.24),
  ('Gujarat','Panchmahal',0.24),      ('Gujarat','Sabarkantha',0.24),
  ('Maharashtra','Gadchiroli',0.26),  ('Maharashtra','Nandurbar',0.27),
  ('Maharashtra','Amravati',0.25),    ('Maharashtra','Washim',0.22),
  ('Rajasthan','Banswara',0.28),      ('Rajasthan','Dungarpur',0.26),
  ('Rajasthan','Pratapgarh',0.24),   ('Rajasthan','Barmer',0.22),
  ('Karnataka','Chamarajanagar',0.34),('Karnataka','Hassan',0.33),
  ('Karnataka','Dakshina Kannada',0.33),
  ('West Bengal','Jalpaiguri',0.32),  ('West Bengal','Darjeeling',0.34),
  ('West Bengal','Purulia',0.34),
  ('Uttar Pradesh','Sonbhadra',0.36),  ('Uttar Pradesh','Lakhimpur Kheri',0.32),
  ('Uttar Pradesh','Bahraich',0.32),
  ('Telangana','Adilabad',0.35),     ('Telangana','Bhadradri Kothagudem',0.33),
  ('Telangana','Nalgonda',0.32),
  ('Kerala','Wayanad',0.52),         ('Kerala','Idukki',0.48),
  ('Himachal Pradesh','Kinnaur',0.51),('Himachal Pradesh','Lahaul Spiti',0.49);

-- 0.09% of the enrolled universe per district: enough rows for statistically
-- meaningful dashboard ratios without bloating the free-tier project.
do $$
declare
  st record;
  ds record;
  n integer;
  i integer;
  h integer;
  frac numeric;
  given text;
  fam text;
  cls text;
  gen text;
  pvtg boolean;
  otr boolean;
  has_sch boolean;
  income numeric;
  need numeric;
begin
  for st in select * from seed_state order by state_ut loop
    for ds in select * from seed_district where state_ut = st.state_ut order by district loop
      n := greatest(1, round(st.enrolled * ds.weight * 0.0009)::int);

      for i in 1..n loop
        given := (array['Suriya','Birendra','Sunita','Dhananjay','Kanti','Mangal','Jamuna',
                        'Laxmi','Bhagirathi','Chhaya','Phool','Arjun','Sita','Ramesh',
                        'Gauri','Budhadev','Saraswati','Tulsidas','Kamal','Deepak'])[1 + (i * 7) % 20];
        fam := (array['Hansda','Munda','Singh','Tirki','Mahato','Bhanja','Kiskinda','Mandal',
                       'Nayak','Sethi','Chore','Bagia','Marandi','Soren','Kiskinda','Bhoi'])[1 + (i * 11) % 16];
        cls := (array['IX','IX','X','X','X','XI','XI','XII'])[1 + (i * 3) % 8];
        gen := case when (i * 5) % 100 < 47 then 'female' else 'male' end;

        h := abs(hashtext(st.state_ut || ds.district || i::text));
        frac := (h % 1000) / 1000.0;
        pvtg := frac < st.pvtg_share;

        h := abs(hashtext('otr|' || st.state_ut || i::text));
        otr := (h % 1000) / 1000.0 < st.otr_rate;

        h := abs(hashtext('sch|' || st.state_ut || i::text));
        has_sch := (h % 1000) / 1000.0 < (0.30 + st.otr_rate * 0.28);

        h := abs(hashtext('inc|' || st.state_ut || i::text));
        income := round(st.median_income * (0.55 + 1.35 * ((h % 1000) / 1000.0)) / 1000.0) * 1000;

        -- need_score: what makes this student worth an outreach call.
        need := (case when not has_sch then 40 else 0 end)
              + (case when not otr then 25 else 0 end)
              + (case when pvtg then 20 else 0 end)
              + (case when income <= 150000 then 15 else 0 end);

        insert into public.coverage_records (
          udise_plus, apaar_id, student_name, class_level, gender, state_ut, district, block,
          is_pvtg, family_income, enrolled, has_otr, otr_year, has_scholarship,
          match_status, need_score, source_systems
        ) values (
          'UD' || upper(substr(md5(st.state_ut || ds.district || i::text), 1, 10)),
          case when otr then 'APAAR-' || upper(substr(md5('a|' || st.state_ut || i::text), 1, 10)) end,
          given || ' ' || fam,
          cls, gen, st.state_ut, ds.district, ds.district || ' Block',
          pvtg, income, true, otr,
          case when otr then '2025' end,
          has_sch,
          case when has_sch then 'matched' else 'unmatched' end,
          least(need, 99.00),
          case when otr then array['udise_plus'] else array['udise_plus','otr'] end
        )
        on conflict do nothing;
      end loop;
    end loop;
  end loop;
end $$;

create index if not exists coverage_need_desc_idx
  on public.coverage_records (need_score desc)
  where match_status = 'unmatched';
