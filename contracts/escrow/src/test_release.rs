use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token, IntoVal,
};

const PRINCIPAL: i128 = 1_000_000;
const POOL: i128 = 100_000;

#[test]
fn settle_after_release_is_invalid_state() {
    let f = Fixture::new(PRINCIPAL, POOL);
    f.mature();
    f.authorize("release", &f.owner);
    f.client().release(&f.id, &f.owner);
    let before = f.balances();
    f.authorize("settle_commitment", &f.owner);
    assert_eq!(f.client().try_settle_commitment(&f.id, &f.owner), Err(Ok(Error::InvalidState)));
    assert_eq!(f.balances(), before);
    assert_eq!(f.commitment().status, EscrowStatus::Released);
}

#[test]
fn settle_with_zero_yield_pays_principal() {
    let f = Fixture::new(1, 0);
    f.mature();
    assert_eq!(f.commitment().accrued_yield, 0);
    let before = f.balances();
    f.authorize("settle_commitment", &f.owner);
    let result = f.client().settle_commitment(&f.id, &f.owner);
    assert_eq!(result.settlement_amount, 1);
    f.assert_paid(&before, result.settlement_amount, 0);
}

#[test]
fn release_with_zero_yield_pays_principal() {
    let f = Fixture::new(1, 0);
    f.mature();
    assert_eq!(f.commitment().accrued_yield, 0);
    let before = f.balances();
    f.authorize("release", &f.owner);
    let paid = f.client().release(&f.id, &f.owner);
    assert_eq!(paid, 1);
    f.assert_paid(&before, paid, 0);
}

#[test]
fn settle_with_insufficient_pool_is_atomic() {
    let f = Fixture::new(PRINCIPAL, 1);
    f.mature();
    let before = f.balances();
    f.authorize("settle_commitment", &f.owner);
    assert_eq!(f.client().try_settle_commitment(&f.id, &f.owner), Err(Ok(Error::InsufficientYieldPool)));
    assert_eq!(f.balances(), before);
    assert_eq!(f.commitment().status, EscrowStatus::Funded);
}

#[test]
fn settle_by_stranger_is_unauthorized() {
    let f = Fixture::new(PRINCIPAL, POOL);
    f.mature();
    let stranger = Address::generate(&f.env);
    let before = f.balances();
    f.authorize("settle_commitment", &stranger);
    assert_eq!(f.client().try_settle_commitment(&f.id, &stranger), Err(Ok(Error::Unauthorized)));
    assert_eq!(f.balances(), before);
    assert_eq!(f.commitment().status, EscrowStatus::Funded);
}

#[test]
fn settle_by_admin_pays_owner() {
    let f = Fixture::new(PRINCIPAL, POOL);
    f.mature();
    let c = f.commitment();
    let before = f.balances();
    f.authorize("settle_commitment", &f.admin);
    let result = f.client().settle_commitment(&f.id, &f.admin);
    assert_eq!(result.settlement_amount, c.amount + c.accrued_yield);
    f.assert_paid(&before, result.settlement_amount, c.accrued_yield);
}

#[test]
fn release_before_maturity_not_matured() {
    let f = Fixture::new(PRINCIPAL, POOL);
    f.env.ledger().with_mut(|ledger| ledger.timestamp = f.commitment().maturity - 1);
    let before = f.balances();
    f.authorize("release", &f.owner);
    assert_eq!(f.client().try_release(&f.id, &f.owner), Err(Ok(Error::NotMatured)));
    assert_eq!(f.balances(), before);
    assert_eq!(f.commitment().status, EscrowStatus::Funded);
}

#[test]
fn insufficient_yield_pool_is_atomic() {
    let f = Fixture::new(PRINCIPAL, 1);
    f.mature();
    let before = f.balances();
    f.authorize("release", &f.owner);
    assert_eq!(f.client().try_release(&f.id, &f.owner), Err(Ok(Error::InsufficientYieldPool)));
    assert_eq!(f.balances(), before);
    assert_eq!(f.commitment().status, EscrowStatus::Funded);
}

#[test]
fn double_release_is_invalid_state() {
    let f = Fixture::new(PRINCIPAL, POOL);
    f.mature();
    f.authorize("release", &f.owner);
    f.client().release(&f.id, &f.owner);
    let before = f.balances();
    f.authorize("release", &f.owner);
    assert_eq!(f.client().try_release(&f.id, &f.owner), Err(Ok(Error::InvalidState)));
    assert_eq!(f.balances(), before);
    assert_eq!(f.commitment().status, EscrowStatus::Released);
}

#[test]
fn release_by_stranger_is_unauthorized() {
    let f = Fixture::new(PRINCIPAL, POOL);
    f.mature();
    let stranger = Address::generate(&f.env);
    let before = f.balances();
    f.authorize("release", &stranger);
    assert_eq!(f.client().try_release(&f.id, &stranger), Err(Ok(Error::Unauthorized)));
    assert_eq!(f.balances(), before);
    assert_eq!(token::Client::new(&f.env, &f.token).balance(&stranger), 0);
    assert_eq!(f.commitment().status, EscrowStatus::Funded);
}

#[test]
fn release_by_admin_pays_owner() {
    let f = Fixture::new(PRINCIPAL, POOL);
    f.mature();
    let c = f.commitment();
    let before = f.balances();
    f.authorize("release", &f.admin);
    let paid = f.client().release(&f.id, &f.admin);
    assert_eq!(paid, c.amount + c.accrued_yield);
    f.assert_paid(&before, paid, c.accrued_yield);
}

#[test]
fn settle_pays_principal_plus_yield() {
    let f = Fixture::new(PRINCIPAL, POOL);
    f.mature();
    let c = f.commitment();
    let before = f.balances();
    f.authorize("settle_commitment", &f.owner);
    let result = f.client().settle_commitment(&f.id, &f.owner);
    assert_eq!(result.settlement_amount, c.amount + c.accrued_yield);
    assert_eq!(result.final_status, String::from_str(&f.env, "SETTLED"));
    f.assert_paid(&before, result.settlement_amount, c.accrued_yield);
}

#[test]
fn release_pays_principal_plus_yield() {
    let f = Fixture::new(PRINCIPAL, POOL);
    f.mature();
    let c = f.commitment();
    let before = f.balances();
    f.authorize("release", &f.owner);
    let paid = f.client().release(&f.id, &f.owner);
    assert_eq!(paid, c.amount + c.accrued_yield);
    f.assert_paid(&before, paid, c.accrued_yield);
}

struct Fixture {
    env: Env,
    contract: Address,
    token: Address,
    owner: Address,
    admin: Address,
    fee: Address,
    id: u64,
}

#[derive(Debug, PartialEq, Eq)]
struct Balances {
    owner: i128,
    contract: i128,
    admin: i128,
    fee: i128,
    pool: i128,
}

impl Fixture {
    fn new(amount: i128, pool: i128) -> Self {
        let env = Env::default();
        env.set_config(soroban_sdk::EnvTestConfig {
            capture_snapshot_at_drop: false,
        });
        // Setup is independent of settlement authorization, which uses exact mocks below.
        env.mock_all_auths();
        env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let fee = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let contract = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract);
        client.initialize(&admin, &token, &fee, &200, &300, &500);
        let sac = token::StellarAssetClient::new(&env, &token);
        sac.mint(&owner, &amount);
        sac.mint(&admin, &(POOL * 2));
        let id = client.create_commitment(
            &owner, &token, &amount, &RiskProfile::Balanced, &30, &300, &Map::new(&env),
        );
        client.fund_escrow(&id);
        if pool > 0 {
            client.deposit_yield_pool(&admin, &pool);
        }
        env.mock_auths(&[]);
        let fixture = Self { env, contract, token, owner, admin, fee, id };
        assert_eq!(fixture.balances(), Balances {
            owner: 0, contract: amount + pool, admin: POOL * 2 - pool, fee: 0, pool,
        });
        fixture
    }

    fn client(&self) -> EscrowContractClient<'_> {
        EscrowContractClient::new(&self.env, &self.contract)
    }

    fn commitment(&self) -> Commitment {
        self.client().get_commitment(&self.id)
    }

    fn mature(&self) {
        self.env.ledger().with_mut(|ledger| ledger.timestamp = self.commitment().maturity);
    }

    fn authorize(&self, method: &str, caller: &Address) {
        self.env.mock_auths(&[MockAuth {
            address: caller,
            invoke: &MockAuthInvoke {
                contract: &self.contract,
                fn_name: method,
                args: (self.id, caller.clone()).into_val(&self.env),
                sub_invokes: &[],
            },
        }]);
    }

    fn balances(&self) -> Balances {
        let token = token::Client::new(&self.env, &self.token);
        let pool = self.env.as_contract(&self.contract, || {
            self.env.storage().instance().get(&DataKey::YieldPool).unwrap_or(0)
        });
        assert_eq!(pool, self.client().get_yield_pool_balance());
        Balances {
            owner: token.balance(&self.owner),
            contract: token.balance(&self.contract),
            admin: token.balance(&self.admin),
            fee: token.balance(&self.fee),
            pool,
        }
    }

    fn assert_paid(&self, before: &Balances, payout: i128, yield_amount: i128) {
        assert_eq!(self.balances(), Balances {
            owner: before.owner + payout,
            contract: before.contract - payout,
            admin: before.admin,
            fee: before.fee,
            pool: before.pool - yield_amount,
        });
        assert_eq!(self.commitment().status, EscrowStatus::Released);
    }

    fn set_commitment(&self, commitment: &Commitment) {
        // Inject otherwise unreachable arithmetic/state edges without changing production APIs.
        self.env.as_contract(&self.contract, || {
            self.env.storage().persistent().set(&DataKey::Commitment(self.id), commitment);
        });
    }
}
