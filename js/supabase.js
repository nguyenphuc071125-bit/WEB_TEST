const SUPABASE_URL = 'https://roxgrvqmctdnajiorwcv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EhTobuwuCQFKhJQqs-gFRQ_LXbyXHqk';

window.supabasePublicConfig = {
    url: SUPABASE_URL,
    key: SUPABASE_KEY
};

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);