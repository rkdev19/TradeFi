# For Python contracts
from beaker import Application, GlobalStateValue
from pyteal import *

class Marketplace(Application):
    listing_count = GlobalStateValue(stack_type=TealType.uint64, default=Int(0))
    
    @external
    def create_listing(self, asset_id: abi.Uint64, price: abi.Uint64, *, output: abi.String):
        # Logic for creating a listing
        return Seq(
            self.listing_count.set(self.listing_count.get() + Int(1)),
            output.set(Concat(Bytes("Listing created with ID: "), Itob(self.listing_count.get())))
        )
        
    @external
    def buy(self, listing_id: abi.Uint64, *, output: abi.String):
        # Logic for buying a listed asset
        return output.set(Bytes("Purchase successful"))
