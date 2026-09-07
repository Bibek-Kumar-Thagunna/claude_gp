import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

/** A lat/lng point supplied as query params (?lat=..&lng=..). */
export class GeoQueryDto {
  @ApiProperty({ example: 27.7172 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 85.324 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}

export class NearbyQueryDto extends GeoQueryDto {
  @ApiPropertyOptional({ example: 5, description: 'Search radius in km (max 25)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(25)
  radiusKm?: number;
}

export class SearchQueryDto {
  @ApiProperty({ example: 'momo' })
  @IsString()
  @MinLength(2)
  q!: string;
}
