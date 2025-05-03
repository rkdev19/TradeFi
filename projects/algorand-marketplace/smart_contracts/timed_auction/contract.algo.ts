import { Contract } from '@algorandfoundation/algorand-typescript'

export class TimedAuction extends Contract {
  hello(name: string): string {
    return `Hello, ${name}`
  }
}
