create or replace function public.calculate_volunteer_hours()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  minutes_diff integer;
begin
  if new.end_time <= new.start_time then
    raise exception 'end_time must be after start_time';
  end if;

  minutes_diff := extract(epoch from (new.end_time - new.start_time)) / 60;
  new.hours := round((minutes_diff::numeric / 60), 2);

  if new.hours <= 0 then
    raise exception 'hours must be greater than zero';
  end if;

  return new;
end;
$$;

drop trigger if exists volunteer_hours_calculate on public.volunteer_hours;
create trigger volunteer_hours_calculate
before insert or update on public.volunteer_hours
for each row
execute function public.calculate_volunteer_hours();
